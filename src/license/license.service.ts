import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type {
  License,
  Device,
  Prisma,
  PrismaClient,
} from '../../generated/prisma/client.js';
import {
  CreateLicenseDto,
  ActivateLicenseDto,
  VerifyLicenseDto,
  DeactivateLicenseDto,
} from './dto/index.js';
import {
  LICENSE_CONSTANTS,
  LICENSE_STATUS,
  LICENSE_ACTIONS,
  ERROR_CODES,
} from '../common/constants.js';
import {
  LicenseNotFoundException,
  InvalidLicenseKeyException,
  LicenseNotActiveException,
  LicenseExpiredException,
  DeviceNotFoundException,
  FingerprintMismatchException,
} from '../common/exceptions/license.exceptions.js';
import { generateLicenseKey } from '../common/utils/license-key.util.js';
import {
  findDeviceById,
  findOldestDevice,
  extractFingerprint,
  createFingerprintMetadata,
} from '../common/utils/device.util.js';
import {
  checkAndUpdateExpiration,
  isLicenseExpired,
} from '../common/utils/license-status.util.js';

interface LicenseWithDevices {
  id: string;
  licenseKey: string;
  email: string;
  status: string;
  maxDevices: number;
  expiresAt: Date | null;
  devices: Device[];
}

export interface LicenseResponse {
  status: string;
  expiresAt: Date | null;
  devicesUsed: number;
  maxDevices: number;
}

export interface ActivationResponse {
  success: boolean;
  message: string;
  license: LicenseResponse;
}

export interface VerificationResponse {
  valid: boolean;
  reason?: string;
  status?: string;
  expiresAt?: Date | null;
  gracePeriodHours?: number;
  devicesUsed?: number;
  maxDevices?: number;
}

export interface DeactivationResponse {
  success: boolean;
  message: string;
}

@Injectable()
export class LicenseService {
  constructor(private readonly prisma: PrismaService) {}

  async createLicense(dto: CreateLicenseDto) {
    const existingLicense = await this.findByPaymentId(dto.stripePaymentId);

    if (existingLicense) {
      return existingLicense;
    }

    const licenseKey = generateLicenseKey();

    return this.prisma.$transaction(async (tx) => {
      await this.logAction(tx, {
        action: LICENSE_ACTIONS.LICENSE_CREATE_ATTEMPT,
        stripePaymentId: dto.stripePaymentId,
        metadata: dto as unknown as Record<string, unknown>,
      });

      const license = await tx.license.create({
        data: {
          licenseKey,
          email: dto.email,
          stripePaymentId: dto.stripePaymentId,
          stripeCustomerId: dto.stripeCustomerId,
          maxDevices: dto.maxDevices ?? LICENSE_CONSTANTS.DEFAULT_MAX_DEVICES,
          expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
          status: LICENSE_STATUS.ACTIVE,
        },
      });

      await this.logAction(tx, {
        licenseId: license.id,
        action: LICENSE_ACTIONS.LICENSE_CREATED,
        licenseKey: license.licenseKey,
        stripePaymentId: dto.stripePaymentId,
      });

      return license;
    });
  }

  async activateLicense(
    dto: ActivateLicenseDto,
    ipAddress?: string,
  ): Promise<ActivationResponse> {
    const license = await this.findLicenseWithDevices(dto.licenseKey);

    if (!license) {
      await this.logFailedActivation(
        dto,
        ipAddress,
        ERROR_CODES.LICENSE_NOT_FOUND,
      );
      throw new InvalidLicenseKeyException();
    }

    this.validateLicenseStatus(license);
    await checkAndUpdateExpiration(this.prisma, license);

    const existingDevice = findDeviceById(license.devices, dto.deviceId);

    if (existingDevice) {
      return this.reactivateDevice(license, existingDevice, dto, ipAddress);
    }

    if (license.devices.length >= license.maxDevices) {
      const oldestDevice = findOldestDevice(license.devices);
      if (oldestDevice) {
        await this.prisma.$transaction(async (tx) => {
          await tx.device.delete({ where: { id: oldestDevice.id } });
          await this.logAction(tx, {
            licenseId: license.id,
            action: LICENSE_ACTIONS.DEVICE_AUTO_DEACTIVATED,
            licenseKey: dto.licenseKey,
            deviceId: oldestDevice.deviceId,
            ipAddress,
            metadata: {
              reason: 'Device limit reached, oldest device deactivated',
            },
          });
        });
      }
    }

    return this.activateNewDevice(license, dto, ipAddress);
  }

  async verifyLicense(
    dto: VerifyLicenseDto,
    ipAddress?: string,
  ): Promise<VerificationResponse> {
    const license = await this.findLicenseWithDevices(dto.licenseKey);

    if (!license) {
      return { valid: false, reason: ERROR_CODES.LICENSE_NOT_FOUND };
    }

    if (license.status !== LICENSE_STATUS.ACTIVE) {
      return {
        valid: false,
        reason: ERROR_CODES.LICENSE_NOT_ACTIVE,
        status: license.status,
      };
    }

    if (await isLicenseExpired(this.prisma, license)) {
      return { valid: false, reason: ERROR_CODES.LICENSE_EXPIRED };
    }

    const device = findDeviceById(license.devices, dto.deviceId);

    if (!device) {
      return { valid: false, reason: ERROR_CODES.DEVICE_NOT_ACTIVATED };
    }

    if (dto.fingerprint) {
      const storedFingerprint = extractFingerprint(device.metadata);
      if (storedFingerprint && storedFingerprint !== dto.fingerprint) {
        return { valid: false, reason: ERROR_CODES.FINGERPRINT_MISMATCH };
      }
    }

    if (dto.fingerprint && !extractFingerprint(device.metadata)) {
      await this.prisma.$transaction(async (tx) => {
        await tx.device.update({
          where: { id: device.id },
          data: {
            metadata: createFingerprintMetadata(dto.fingerprint),
            lastSeenAt: new Date(),
            ipAddress,
          },
        });
      });
    } else {
      await this.updateDeviceLastSeen(device.id, ipAddress);
    }

    return {
      valid: true,
      status: license.status,
      expiresAt: license.expiresAt,
      gracePeriodHours: LICENSE_CONSTANTS.GRACE_PERIOD_HOURS,
      devicesUsed: license.devices.length,
      maxDevices: license.maxDevices,
    };
  }

  async deactivateLicense(
    dto: DeactivateLicenseDto,
    ipAddress?: string,
  ): Promise<DeactivationResponse> {
    const license = await this.findByLicenseKey(dto.licenseKey);

    if (!license) {
      throw new InvalidLicenseKeyException();
    }

    const device = await this.findDeviceByCompositeKey(
      license.id,
      dto.deviceId,
    );

    if (!device) {
      throw new DeviceNotFoundException();
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.device.delete({ where: { id: device.id } });
      await this.logAction(tx, {
        licenseId: license.id,
        action: LICENSE_ACTIONS.DEVICE_DEACTIVATED,
        licenseKey: dto.licenseKey,
        deviceId: dto.deviceId,
        ipAddress,
      });
    });

    return { success: true, message: 'Device deactivated successfully' };
  }

  async getLicenseInfo(licenseKey: string) {
    const license = await this.prisma.license.findUnique({
      where: { licenseKey },
      include: {
        devices: {
          select: {
            deviceId: true,
            deviceName: true,
            browserInfo: true,
            lastSeenAt: true,
            activatedAt: true,
          },
          orderBy: { activatedAt: 'desc' },
        },
      },
    });

    if (!license) {
      throw new LicenseNotFoundException();
    }

    return {
      licenseKey: license.licenseKey,
      email: license.email,
      status: license.status,
      expiresAt: license.expiresAt,
      devicesUsed: license.devices.length,
      maxDevices: license.maxDevices,
      createdAt: license.createdAt,
      devices: license.devices,
    };
  }

  async suspendLicense(stripePaymentId: string, reason: string) {
    const license = await this.findByPaymentId(stripePaymentId);

    if (!license) {
      throw new LicenseNotFoundException();
    }

    await this.updateLicenseStatus(license.id, LICENSE_STATUS.SUSPENDED, {
      action: LICENSE_ACTIONS.LICENSE_SUSPENDED,
      licenseKey: license.licenseKey,
      stripePaymentId,
      metadata: { reason },
    });

    return { success: true };
  }

  async refundLicense(stripePaymentId: string) {
    const license = await this.findByPaymentId(stripePaymentId);

    if (!license) {
      throw new LicenseNotFoundException();
    }

    await this.updateLicenseStatus(license.id, LICENSE_STATUS.REFUNDED, {
      action: LICENSE_ACTIONS.LICENSE_REFUNDED,
      licenseKey: license.licenseKey,
      stripePaymentId,
    });

    return { success: true };
  }

  private async findByPaymentId(stripePaymentId: string) {
    return this.prisma.license.findUnique({ where: { stripePaymentId } });
  }

  private async findByLicenseKey(licenseKey: string) {
    return this.prisma.license.findUnique({ where: { licenseKey } });
  }

  private async findLicenseWithDevices(licenseKey: string) {
    return this.prisma.license.findUnique({
      where: { licenseKey },
      include: { devices: true },
    });
  }

  private async findDeviceByCompositeKey(licenseId: string, deviceId: string) {
    return this.prisma.device.findUnique({
      where: { licenseId_deviceId: { licenseId, deviceId } },
    });
  }

  private validateLicenseStatus(license: LicenseWithDevices) {
    if (license.status !== LICENSE_STATUS.ACTIVE) {
      throw new LicenseNotActiveException(license.status);
    }
  }

  private async reactivateDevice(
    license: LicenseWithDevices,
    device: Device,
    dto: ActivateLicenseDto,
    ipAddress?: string,
  ): Promise<ActivationResponse> {
    if (dto.fingerprint) {
      const storedFingerprint = extractFingerprint(device.metadata);
      if (storedFingerprint && storedFingerprint !== dto.fingerprint) {
        throw new FingerprintMismatchException();
      }
    }

    await this.prisma.$transaction(async (tx) => {
      const updateData: {
        lastSeenAt: Date;
        ipAddress?: string;
        metadata?: { fingerprint: string };
      } = {
        lastSeenAt: new Date(),
      };
      if (ipAddress) {
        updateData.ipAddress = ipAddress;
      }
      if (dto.fingerprint && !extractFingerprint(device.metadata)) {
        updateData.metadata = createFingerprintMetadata(dto.fingerprint);
      }

      await tx.device.update({
        where: { id: device.id },
        data: updateData,
      });

      await this.logAction(tx, {
        licenseId: license.id,
        action: LICENSE_ACTIONS.DEVICE_REACTIVATED,
        licenseKey: dto.licenseKey,
        deviceId: dto.deviceId,
        ipAddress,
      });
    });

    return {
      success: true,
      message: 'Device already activated',
      license: this.buildLicenseResponse(license),
    };
  }

  private async activateNewDevice(
    license: LicenseWithDevices,
    dto: ActivateLicenseDto,
    ipAddress?: string,
  ): Promise<ActivationResponse> {
    await this.prisma.$transaction(async (tx) => {
      await tx.device.create({
        data: {
          licenseId: license.id,
          deviceId: dto.deviceId,
          deviceName: dto.deviceInfo?.name ?? 'Unknown',
          browserInfo: dto.deviceInfo?.browser,
          ipAddress,
          metadata: dto.fingerprint
            ? createFingerprintMetadata(dto.fingerprint)
            : undefined,
        },
      });

      await this.logAction(tx, {
        licenseId: license.id,
        action: LICENSE_ACTIONS.DEVICE_ACTIVATED,
        licenseKey: dto.licenseKey,
        deviceId: dto.deviceId,
        ipAddress,
        metadata: dto.deviceInfo as unknown as Record<string, unknown>,
      });
    });

    return {
      success: true,
      message: 'Activated successfully',
      license: this.buildLicenseResponse(license, license.devices.length + 1),
    };
  }

  private async updateDeviceLastSeen(deviceId: string, ipAddress?: string) {
    return this.prisma.device.update({
      where: { id: deviceId },
      data: { lastSeenAt: new Date(), ipAddress },
    });
  }

  private async updateLicenseStatus(
    licenseId: string,
    status: string,
    logData: Record<string, unknown> & { action: string },
  ) {
    return this.prisma.$transaction([
      this.prisma.license.update({
        where: { id: licenseId },
        data: { status: status as License['status'] },
      }),
      this.prisma.licenseLog.create({
        data: { licenseId, ...logData },
      }),
    ]);
  }

  private async logAction(
    tx:
      | PrismaService
      | Parameters<Parameters<PrismaService['$transaction']>[0]>[0],
    data: Record<string, unknown> & { action: string },
  ) {
    return (tx as any).licenseLog.create({ data });
  }

  private async logFailedActivation(
    dto: ActivateLicenseDto,
    ipAddress: string | undefined,
    reason: string,
  ) {
    await this.prisma.licenseLog.create({
      data: {
        action: LICENSE_ACTIONS.ACTIVATION_FAILED,
        licenseKey: dto.licenseKey,
        deviceId: dto.deviceId,
        ipAddress,
        metadata: { reason },
      },
    });
  }

  private buildLicenseResponse(
    license: LicenseWithDevices,
    devicesUsed?: number,
  ): LicenseResponse {
    return {
      status: license.status,
      expiresAt: license.expiresAt,
      devicesUsed: devicesUsed ?? license.devices.length,
      maxDevices: license.maxDevices,
    };
  }
}
