import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type { License, Device, Prisma } from '../../generated/prisma/client.js';
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
import { validateLicenseExpiration } from '../common/utils/license-status.util.js';
import type {
  LicenseResponse,
  ActivationResponse,
  VerificationResponse,
  DeactivationResponse,
} from '../common/types/index.js';

interface LicenseWithDevices extends License {
  devices: Device[];
}

@Injectable()
export class LicenseService {
  constructor(private readonly prisma: PrismaService) {}

  async createLicense(dto: CreateLicenseDto): Promise<License> {
    const existingLicense = await this.prisma.license.findUnique({
      where: { stripePaymentId: dto.stripePaymentId },
    });

    if (existingLicense) {
      return existingLicense;
    }

    return this.prisma.$transaction(
      async (tx) => {
        await tx.licenseLog.create({
          data: {
            action: LICENSE_ACTIONS.LICENSE_CREATE_ATTEMPT,
            stripePaymentId: dto.stripePaymentId,
            metadata: {
              email: dto.email,
              maxDevices: dto.maxDevices,
              stripeCustomerId: dto.stripeCustomerId,
            } as Prisma.InputJsonValue,
          },
        });

        const license = await tx.license.create({
          data: {
            licenseKey: generateLicenseKey(),
            email: dto.email,
            stripePaymentId: dto.stripePaymentId,
            stripeCustomerId: dto.stripeCustomerId,
            maxDevices: dto.maxDevices ?? LICENSE_CONSTANTS.DEFAULT_MAX_DEVICES,
            expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
            status: LICENSE_STATUS.ACTIVE,
          },
        });

        await tx.licenseLog.create({
          data: {
            licenseId: license.id,
            action: LICENSE_ACTIONS.LICENSE_CREATED,
            licenseKey: license.licenseKey,
            stripePaymentId: dto.stripePaymentId,
          },
        });

        return license;
      },
      { timeout: 10000 },
    );
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

    if (license.status !== LICENSE_STATUS.ACTIVE) {
      throw new LicenseNotActiveException(license.status as string);
    }

    await validateLicenseExpiration(this.prisma, license);

    const existingDevice = findDeviceById(license.devices, dto.deviceId);

    if (existingDevice) {
      return this.reactivateDevice(license, existingDevice, dto, ipAddress);
    }

    if (license.devices.length >= license.maxDevices) {
      await this.removeOldestDevice(license, dto.licenseKey, ipAddress);
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

    if (await validateLicenseExpiration(this.prisma, license, false)) {
      return { valid: false, reason: ERROR_CODES.LICENSE_EXPIRED };
    }

    const device = findDeviceById(license.devices, dto.deviceId);

    if (!device) {
      return { valid: false, reason: ERROR_CODES.DEVICE_NOT_ACTIVATED };
    }

    const storedFingerprint = extractFingerprint(device.metadata);

    if (
      dto.fingerprint &&
      storedFingerprint &&
      storedFingerprint !== dto.fingerprint
    ) {
      return { valid: false, reason: ERROR_CODES.FINGERPRINT_MISMATCH };
    }

    await this.updateDeviceActivity(device, dto.fingerprint, ipAddress);

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
    const license = await this.prisma.license.findUnique({
      where: { licenseKey: dto.licenseKey },
    });

    if (!license) {
      throw new InvalidLicenseKeyException();
    }

    const device = await this.prisma.device.findUnique({
      where: {
        licenseId_deviceId: { licenseId: license.id, deviceId: dto.deviceId },
      },
    });

    if (!device) {
      throw new DeviceNotFoundException();
    }

    await this.prisma.$transaction(
      async (tx) => {
        await tx.device.delete({ where: { id: device.id } });
        await tx.licenseLog.create({
          data: {
            licenseId: license.id,
            action: LICENSE_ACTIONS.DEVICE_DEACTIVATED,
            licenseKey: dto.licenseKey,
            deviceId: dto.deviceId,
            ipAddress,
          },
        });
      },
      { timeout: 10000 },
    );

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

  async refundLicense(stripePaymentId: string) {
    const license = await this.prisma.license.findUnique({
      where: { stripePaymentId },
    });

    if (!license) {
      throw new LicenseNotFoundException();
    }

    await this.prisma.$transaction(
      async (tx) => {
        await tx.license.update({
          where: { id: license.id },
          data: { status: LICENSE_STATUS.REFUNDED },
        });
        await tx.licenseLog.create({
          data: {
            licenseId: license.id,
            action: LICENSE_ACTIONS.LICENSE_REFUNDED,
            licenseKey: license.licenseKey,
            stripePaymentId,
          },
        });
      },
      { timeout: 10000 },
    );

    return { success: true };
  }

  private async findLicenseWithDevices(
    licenseKey: string,
  ): Promise<LicenseWithDevices | null> {
    return this.prisma.license.findUnique({
      where: { licenseKey },
      include: { devices: true },
    }) as Promise<LicenseWithDevices | null>;
  }

  private async removeOldestDevice(
    license: LicenseWithDevices,
    licenseKey: string,
    ipAddress?: string,
  ): Promise<void> {
    const oldestDevice = findOldestDevice(license.devices);

    if (!oldestDevice) {
      return;
    }

    await this.prisma.$transaction(
      async (tx) => {
        await tx.device.delete({ where: { id: oldestDevice.id } });
        await tx.licenseLog.create({
          data: {
            licenseId: license.id,
            action: LICENSE_ACTIONS.DEVICE_AUTO_DEACTIVATED,
            licenseKey,
            deviceId: oldestDevice.deviceId,
            ipAddress,
            metadata: {
              reason: 'Device limit reached, oldest device deactivated',
            } as Prisma.InputJsonValue,
          },
        });
      },
      { timeout: 10000 },
    );
  }

  private async reactivateDevice(
    license: LicenseWithDevices,
    device: Device,
    dto: ActivateLicenseDto,
    ipAddress?: string,
  ): Promise<ActivationResponse> {
    const storedFingerprint = extractFingerprint(device.metadata);

    if (
      dto.fingerprint &&
      storedFingerprint &&
      storedFingerprint !== dto.fingerprint
    ) {
      throw new FingerprintMismatchException();
    }

    await this.prisma.$transaction(
      async (tx) => {
        const updateData: {
          lastSeenAt: Date;
          ipAddress?: string;
          metadata?: Prisma.InputJsonValue;
        } = { lastSeenAt: new Date() };

        if (ipAddress) {
          updateData.ipAddress = ipAddress;
        }

        if (dto.fingerprint && !storedFingerprint) {
          updateData.metadata = createFingerprintMetadata(dto.fingerprint);
        }

        await tx.device.update({ where: { id: device.id }, data: updateData });
        await tx.licenseLog.create({
          data: {
            licenseId: license.id,
            action: LICENSE_ACTIONS.DEVICE_REACTIVATED,
            licenseKey: dto.licenseKey,
            deviceId: dto.deviceId,
            ipAddress,
          },
        });
      },
      { timeout: 10000 },
    );

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
    await this.prisma.$transaction(
      async (tx) => {
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

        await tx.licenseLog.create({
          data: {
            licenseId: license.id,
            action: LICENSE_ACTIONS.DEVICE_ACTIVATED,
            licenseKey: dto.licenseKey,
            deviceId: dto.deviceId,
            ipAddress,
            metadata: dto.deviceInfo
              ? ({
                  name: dto.deviceInfo.name,
                  browser: dto.deviceInfo.browser,
                  os: dto.deviceInfo.os,
                  timezone: dto.deviceInfo.timezone,
                } as Prisma.InputJsonValue)
              : undefined,
          },
        });
      },
      { timeout: 10000 },
    );

    return {
      success: true,
      message: 'Activated successfully',
      license: this.buildLicenseResponse(license, license.devices.length + 1),
    };
  }

  private async updateDeviceActivity(
    device: Device,
    fingerprint?: string,
    ipAddress?: string,
  ): Promise<void> {
    const storedFingerprint = extractFingerprint(device.metadata);

    if (fingerprint && !storedFingerprint) {
      await this.prisma.device.update({
        where: { id: device.id },
        data: {
          metadata: createFingerprintMetadata(fingerprint),
          lastSeenAt: new Date(),
          ipAddress,
        },
      });
    } else {
      await this.prisma.device.update({
        where: { id: device.id },
        data: { lastSeenAt: new Date(), ipAddress },
      });
    }
  }

  private async logFailedActivation(
    dto: ActivateLicenseDto,
    ipAddress: string | undefined,
    reason: string,
  ): Promise<void> {
    await this.prisma.licenseLog.create({
      data: {
        action: LICENSE_ACTIONS.ACTIVATION_FAILED,
        licenseKey: dto.licenseKey,
        deviceId: dto.deviceId,
        ipAddress,
        metadata: { reason } as Prisma.InputJsonValue,
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
