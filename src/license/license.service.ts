import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type {
  License,
  Device,
  PrismaClient,
} from '../../generated/prisma/client.js';

type TransactionClient = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;
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
import {
  checkAndUpdateExpiration,
  isLicenseExpired,
} from '../common/utils/license-status.util.js';

interface LicenseWithDevices extends License {
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

  async createLicense(dto: CreateLicenseDto): Promise<License> {
    const existingLicense = await this.findByPaymentId(dto.stripePaymentId);

    if (existingLicense) {
      return existingLicense;
    }

    const licenseKey = generateLicenseKey();

    return this.prisma.$transaction(async (tx: TransactionClient) => {
      await this.logAction(tx, {
        action: LICENSE_ACTIONS.LICENSE_CREATE_ATTEMPT,
        stripePaymentId: dto.stripePaymentId,
        metadata: dto as unknown as Record<string, unknown>,
      });

      const license = (await tx.license.create({
        data: {
          licenseKey,
          email: dto.email,
          stripePaymentId: dto.stripePaymentId,
          stripeCustomerId: dto.stripeCustomerId,
          maxDevices: dto.maxDevices ?? LICENSE_CONSTANTS.DEFAULT_MAX_DEVICES,
          expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
          status: LICENSE_STATUS.ACTIVE,
        },
      })) as unknown as License;

      await this.logAction(tx, {
        licenseId: (license as { id: string }).id,
        action: LICENSE_ACTIONS.LICENSE_CREATED,
        licenseKey: (license as { licenseKey: string }).licenseKey,
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

    const licenseTyped = license as unknown as LicenseWithDevices;
    if (licenseTyped.devices.length >= licenseTyped.maxDevices) {
      const oldestDevice = findOldestDevice(licenseTyped.devices);
      if (oldestDevice) {
        await this.prisma.$transaction(async (tx: TransactionClient) => {
          const oldestDeviceTyped = oldestDevice as unknown as Device;
          await tx.device.delete({
            where: { id: (oldestDeviceTyped as { id: string }).id },
          });
          await this.logAction(tx, {
            licenseId: (licenseTyped as { id: string }).id,
            action: LICENSE_ACTIONS.DEVICE_AUTO_DEACTIVATED,
            licenseKey: dto.licenseKey,
            deviceId: (oldestDeviceTyped as { deviceId: string }).deviceId,
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

    const deviceTyped = device as unknown as Device;
    if (dto.fingerprint) {
      const storedFingerprint = extractFingerprint(
        (deviceTyped as { metadata: unknown }).metadata,
      );
      if (storedFingerprint && storedFingerprint !== dto.fingerprint) {
        return { valid: false, reason: ERROR_CODES.FINGERPRINT_MISMATCH };
      }
    }

    if (
      dto.fingerprint &&
      !extractFingerprint((deviceTyped as { metadata: unknown }).metadata)
    ) {
      await this.prisma.$transaction(async (tx: TransactionClient) => {
        await tx.device.update({
          where: { id: (deviceTyped as { id: string }).id },
          data: {
            metadata: createFingerprintMetadata(dto.fingerprint!),
            lastSeenAt: new Date(),
            ipAddress,
          },
        });
      });
    } else {
      await this.updateDeviceLastSeen(
        (deviceTyped as { id: string }).id,
        ipAddress,
      );
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

    const licenseTyped = license as unknown as License;
    const device = await this.findDeviceByCompositeKey(
      (licenseTyped as { id: string }).id,
      dto.deviceId,
    );

    if (!device) {
      throw new DeviceNotFoundException();
    }

    const deviceTyped = device as unknown as Device;
    await this.prisma.$transaction(async (tx: TransactionClient) => {
      await tx.device.delete({
        where: { id: (deviceTyped as { id: string }).id },
      });
      await this.logAction(tx, {
        licenseId: (licenseTyped as { id: string }).id,
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

    const licenseData = license as unknown as {
      licenseKey: string;
      email: string;
      status: string;
      expiresAt: Date | null;
      devices: unknown[];
      maxDevices: number;
      createdAt: Date;
    };

    return {
      licenseKey: licenseData.licenseKey,
      email: licenseData.email,
      status: licenseData.status,
      expiresAt: licenseData.expiresAt,
      devicesUsed: licenseData.devices.length,
      maxDevices: licenseData.maxDevices,
      createdAt: licenseData.createdAt,
      devices: licenseData.devices,
    };
  }

  async refundLicense(stripePaymentId: string) {
    const license = await this.findByPaymentId(stripePaymentId);

    if (!license) {
      throw new LicenseNotFoundException();
    }

    const licenseTyped = license as unknown as License;
    await this.updateLicenseStatus(
      (licenseTyped as { id: string }).id,
      LICENSE_STATUS.REFUNDED,
      {
        action: LICENSE_ACTIONS.LICENSE_REFUNDED,
        licenseKey: (licenseTyped as { licenseKey: string }).licenseKey,
        stripePaymentId,
      },
    );

    return { success: true };
  }

  private async findByPaymentId(
    stripePaymentId: string,
  ): Promise<License | null> {
    return this.prisma.license.findUnique({
      where: { stripePaymentId },
    }) as Promise<License | null>;
  }

  private async findByLicenseKey(licenseKey: string): Promise<License | null> {
    return this.prisma.license.findUnique({
      where: { licenseKey },
    }) as Promise<License | null>;
  }

  private async findLicenseWithDevices(
    licenseKey: string,
  ): Promise<LicenseWithDevices | null> {
    return this.prisma.license.findUnique({
      where: { licenseKey },
      include: { devices: true },
    }) as Promise<LicenseWithDevices | null>;
  }

  private async findDeviceByCompositeKey(
    licenseId: string,
    deviceId: string,
  ): Promise<Device | null> {
    return this.prisma.device.findUnique({
      where: { licenseId_deviceId: { licenseId, deviceId } },
    }) as Promise<Device | null>;
  }

  private validateLicenseStatus(license: LicenseWithDevices) {
    if (license.status !== LICENSE_STATUS.ACTIVE) {
      throw new LicenseNotActiveException(license.status as string);
    }
  }

  private async reactivateDevice(
    license: LicenseWithDevices,
    device: Device,
    dto: ActivateLicenseDto,
    ipAddress?: string,
  ): Promise<ActivationResponse> {
    const deviceTyped = device as unknown as Device;
    const licenseTyped = license as unknown as LicenseWithDevices;
    if (dto.fingerprint) {
      const storedFingerprint = extractFingerprint(
        (deviceTyped as { metadata: unknown }).metadata,
      );
      if (storedFingerprint && storedFingerprint !== dto.fingerprint) {
        throw new FingerprintMismatchException();
      }
    }

    await this.prisma.$transaction(async (tx: TransactionClient) => {
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
      if (
        dto.fingerprint &&
        !extractFingerprint((deviceTyped as { metadata: unknown }).metadata)
      ) {
        updateData.metadata = createFingerprintMetadata(dto.fingerprint);
      }

      await tx.device.update({
        where: { id: (deviceTyped as { id: string }).id },
        data: updateData,
      });

      await this.logAction(tx, {
        licenseId: (licenseTyped as { id: string }).id,
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
    await this.prisma.$transaction(async (tx: TransactionClient) => {
      await tx.device.create({
        data: {
          licenseId: (license as unknown as LicenseWithDevices & { id: string })
            .id,
          deviceId: dto.deviceId,
          deviceName: dto.deviceInfo?.name ?? 'Unknown',
          browserInfo: dto.deviceInfo?.browser,
          ipAddress,
          metadata: dto.fingerprint
            ? createFingerprintMetadata(dto.fingerprint)
            : undefined,
        },
      });

      const licenseTyped = license as unknown as LicenseWithDevices & {
        id: string;
      };
      await this.logAction(tx, {
        licenseId: licenseTyped.id,
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

  private async updateDeviceLastSeen(
    deviceId: string,
    ipAddress?: string,
  ): Promise<Device> {
    return this.prisma.device.update({
      where: { id: deviceId },
      data: { lastSeenAt: new Date(), ipAddress },
    });
  }

  private async updateLicenseStatus(
    licenseId: string,
    status: string,
    logData: Record<string, unknown> & { action: string },
  ): Promise<void> {
    await this.prisma.$transaction([
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
    tx: PrismaService | TransactionClient,
    data: Record<string, unknown> & { action: string },
  ): Promise<void> {
    await (tx as TransactionClient).licenseLog.create({ data });
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
