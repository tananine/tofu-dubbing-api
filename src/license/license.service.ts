import { Injectable } from '@nestjs/common';
import { eq, and } from 'drizzle-orm';
import { DatabaseService } from '../db/database.service.js';
import {
  licenses,
  devices,
  licenseLogs,
  type License,
  type Device,
} from '../db/schema.js';
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
  constructor(private readonly database: DatabaseService) {}

  private get db() {
    return this.database.db;
  }

  async createLicense(dto: CreateLicenseDto): Promise<License> {
    if (dto.stripePaymentId) {
      const existing = await this.db.query.licenses.findFirst({
        where: eq(licenses.stripePaymentId, dto.stripePaymentId),
      });

      if (existing) {
        return existing;
      }
    }

    return this.db.transaction(async (tx) => {
      await tx.insert(licenseLogs).values({
        action: LICENSE_ACTIONS.LICENSE_CREATE_ATTEMPT,
        stripePaymentId: dto.stripePaymentId,
        metadata: {
          email: dto.email,
          maxDevices: dto.maxDevices,
          stripeCustomerId: dto.stripeCustomerId,
        },
      });

      const [license] = await tx
        .insert(licenses)
        .values({
          licenseKey: generateLicenseKey(),
          email: dto.email,
          stripePaymentId: dto.stripePaymentId,
          stripeCustomerId: dto.stripeCustomerId,
          maxDevices: dto.maxDevices ?? LICENSE_CONSTANTS.DEFAULT_MAX_DEVICES,
          expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
          status: LICENSE_STATUS.ACTIVE as 'ACTIVE',
        })
        .returning();

      await tx.insert(licenseLogs).values({
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

    if (license.status !== LICENSE_STATUS.ACTIVE) {
      throw new LicenseNotActiveException(license.status);
    }

    await this.validateLicenseExpiration(license);

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

    if (await this.validateLicenseExpiration(license, false)) {
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
    const license = await this.db.query.licenses.findFirst({
      where: eq(licenses.licenseKey, dto.licenseKey),
    });

    if (!license) {
      throw new InvalidLicenseKeyException();
    }

    const device = await this.db.query.devices.findFirst({
      where: and(
        eq(devices.licenseId, license.id),
        eq(devices.deviceId, dto.deviceId),
      ),
    });

    if (!device) {
      throw new DeviceNotFoundException();
    }

    await this.db.transaction(async (tx) => {
      await tx.delete(devices).where(eq(devices.id, device.id));
      await tx.insert(licenseLogs).values({
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
    const license = await this.db.query.licenses.findFirst({
      where: eq(licenses.licenseKey, licenseKey),
      with: {
        devices: {
          columns: {
            deviceId: true,
            deviceName: true,
            browserInfo: true,
            lastSeenAt: true,
            activatedAt: true,
          },
          orderBy: (devices, { desc }) => [desc(devices.activatedAt)],
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

  async suspendLicenseByPayment(stripePaymentId: string) {
    const license = await this.db.query.licenses.findFirst({
      where: eq(licenses.stripePaymentId, stripePaymentId),
    });

    if (!license) {
      return;
    }

    await this.db.transaction(async (tx) => {
      await tx
        .update(licenses)
        .set({ status: LICENSE_STATUS.SUSPENDED as 'SUSPENDED' })
        .where(eq(licenses.id, license.id));

      await tx.insert(licenseLogs).values({
        licenseId: license.id,
        action: LICENSE_ACTIONS.LICENSE_SUSPENDED,
        licenseKey: license.licenseKey,
        stripePaymentId,
        metadata: { reason: 'Dispute/Chargeback' },
      });
    });
  }

  private async findLicenseWithDevices(
    licenseKey: string,
  ): Promise<LicenseWithDevices | null> {
    const result = await this.db.query.licenses.findFirst({
      where: eq(licenses.licenseKey, licenseKey),
      with: { devices: true },
    });

    return result as LicenseWithDevices | null;
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

    await this.db.transaction(async (tx) => {
      await tx.delete(devices).where(eq(devices.id, oldestDevice.id));
      await tx.insert(licenseLogs).values({
        licenseId: license.id,
        action: LICENSE_ACTIONS.DEVICE_AUTO_DEACTIVATED,
        licenseKey,
        deviceId: oldestDevice.deviceId,
        ipAddress,
        metadata: { reason: 'Device limit reached, oldest device deactivated' },
      });
    });
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

    await this.db.transaction(async (tx) => {
      const updateData: Partial<Device> = { lastSeenAt: new Date() };

      if (ipAddress) {
        updateData.ipAddress = ipAddress;
      }

      if (dto.fingerprint && !storedFingerprint) {
        updateData.metadata = createFingerprintMetadata(dto.fingerprint);
      }

      await tx.update(devices).set(updateData).where(eq(devices.id, device.id));
      await tx.insert(licenseLogs).values({
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
    await this.db.transaction(async (tx) => {
      await tx.insert(devices).values({
        licenseId: license.id,
        deviceId: dto.deviceId,
        deviceName: dto.deviceInfo?.name ?? 'Unknown',
        browserInfo: dto.deviceInfo?.browser,
        ipAddress,
        metadata: dto.fingerprint
          ? createFingerprintMetadata(dto.fingerprint)
          : undefined,
      });

      await tx.insert(licenseLogs).values({
        licenseId: license.id,
        action: LICENSE_ACTIONS.DEVICE_ACTIVATED,
        licenseKey: dto.licenseKey,
        deviceId: dto.deviceId,
        ipAddress,
        metadata: dto.deviceInfo
          ? {
              name: dto.deviceInfo.name,
              browser: dto.deviceInfo.browser,
              os: dto.deviceInfo.os,
              timezone: dto.deviceInfo.timezone,
            }
          : undefined,
      });
    });

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
      await this.db
        .update(devices)
        .set({
          metadata: createFingerprintMetadata(fingerprint),
          lastSeenAt: new Date(),
          ipAddress,
        })
        .where(eq(devices.id, device.id));
    } else {
      await this.db
        .update(devices)
        .set({ lastSeenAt: new Date(), ipAddress })
        .where(eq(devices.id, device.id));
    }
  }

  private async logFailedActivation(
    dto: ActivateLicenseDto,
    ipAddress: string | undefined,
    reason: string,
  ): Promise<void> {
    await this.db.insert(licenseLogs).values({
      action: LICENSE_ACTIONS.ACTIVATION_FAILED,
      licenseKey: dto.licenseKey,
      deviceId: dto.deviceId,
      ipAddress,
      metadata: { reason },
    });
  }

  private async validateLicenseExpiration(
    license: License,
    throwOnExpired = true,
  ): Promise<boolean> {
    if (!license.expiresAt) {
      return false;
    }

    const isExpired = license.expiresAt < new Date();

    if (isExpired) {
      await this.db
        .update(licenses)
        .set({ status: LICENSE_STATUS.EXPIRED as 'EXPIRED' })
        .where(eq(licenses.id, license.id));

      if (throwOnExpired) {
        throw new (
          await import('../common/exceptions/license.exceptions.js')
        ).LicenseExpiredException();
      }
    }

    return isExpired;
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
