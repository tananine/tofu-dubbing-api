import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { randomBytes } from 'crypto';
import type { License, Device } from '../../generated/prisma/client.js';
import {
  CreateLicenseDto,
  ActivateLicenseDto,
  VerifyLicenseDto,
  DeactivateLicenseDto,
} from './dto/index.js';

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
  private readonly GRACE_PERIOD_HOURS = 72;
  private readonly DEFAULT_MAX_DEVICES = 2;

  constructor(private readonly prisma: PrismaService) {}

  generateLicenseKey(): string {
    const randomPart = randomBytes(16).toString('hex');
    const matched = randomPart.toUpperCase().match(/.{1,4}/g);

    if (!matched) {
      throw new Error('Failed to generate license key');
    }

    return `TOFU-${matched.join('-')}`;
  }

  async createLicense(dto: CreateLicenseDto) {
    const existing = await this.findByPaymentId(dto.stripePaymentId);

    if (existing) {
      return existing;
    }

    const licenseKey = this.generateLicenseKey();

    return this.prisma.$transaction(async (tx) => {
      await this.logAction(tx, {
        action: 'LICENSE_CREATE_ATTEMPT',
        stripePaymentId: dto.stripePaymentId,
        metadata: dto as any,
      });

      const license = await tx.license.create({
        data: {
          licenseKey,
          email: dto.email,
          stripePaymentId: dto.stripePaymentId,
          stripeCustomerId: dto.stripeCustomerId,
          maxDevices: dto.maxDevices ?? this.DEFAULT_MAX_DEVICES,
          expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
          status: 'ACTIVE',
        },
      });

      await this.logAction(tx, {
        licenseId: license.id,
        action: 'LICENSE_CREATED',
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
      await this.logFailedActivation(dto, ipAddress, 'LICENSE_NOT_FOUND');
      throw new NotFoundException('Invalid license key');
    }

    this.validateLicenseStatus(license);
    await this.checkExpiration(license);

    const existingDevice = this.findDevice(license.devices, dto.deviceId);

    if (existingDevice) {
      return this.reactivateDevice(license, existingDevice, dto, ipAddress);
    }

    this.validateDeviceLimit(license);

    return this.activateNewDevice(license, dto, ipAddress);
  }

  async verifyLicense(
    dto: VerifyLicenseDto,
    ipAddress?: string,
  ): Promise<VerificationResponse> {
    const license = await this.findLicenseWithDevices(dto.licenseKey);

    if (!license) {
      return { valid: false, reason: 'LICENSE_NOT_FOUND' };
    }

    if (license.status !== 'ACTIVE') {
      return {
        valid: false,
        reason: 'LICENSE_NOT_ACTIVE',
        status: license.status,
      };
    }

    if (await this.isExpired(license)) {
      return { valid: false, reason: 'LICENSE_EXPIRED' };
    }

    const device = this.findDevice(license.devices, dto.deviceId);

    if (!device) {
      return { valid: false, reason: 'DEVICE_NOT_ACTIVATED' };
    }

    await this.updateDeviceLastSeen(device.id, ipAddress);

    return {
      valid: true,
      status: license.status,
      expiresAt: license.expiresAt,
      gracePeriodHours: this.GRACE_PERIOD_HOURS,
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
      throw new NotFoundException('Invalid license key');
    }

    const device = await this.findDeviceByCompositeKey(license.id, dto.deviceId);

    if (!device) {
      throw new NotFoundException('Device not found');
    }

    await this.removeDevice(device.id);
    await this.logDeactivation(license, dto, ipAddress);

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
      throw new NotFoundException('License not found');
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
      throw new NotFoundException('License not found');
    }

    await this.updateLicenseStatus(license.id, 'SUSPENDED', {
      action: 'LICENSE_SUSPENDED',
      licenseKey: license.licenseKey,
      stripePaymentId,
      metadata: { reason },
    });

    return { success: true };
  }

  async refundLicense(stripePaymentId: string) {
    const license = await this.findByPaymentId(stripePaymentId);

    if (!license) {
      throw new NotFoundException('License not found');
    }

    await this.updateLicenseStatus(license.id, 'REFUNDED', {
      action: 'LICENSE_REFUNDED',
      licenseKey: license.licenseKey,
      stripePaymentId,
    });

    return { success: true };
  }

  async getUnprocessedPayments(stripe: any, days = 7) {
    const cutoffTime = Math.floor(Date.now() / 1000) - days * 24 * 3600;
    const recentPayments = await stripe.paymentIntents.list({
      limit: 100,
      created: { gte: cutoffTime },
    });

    const unprocessed: any[] = [];

    for (const payment of recentPayments.data) {
      if (payment.status === 'succeeded') {
        const license = await this.findByPaymentId(payment.id);
        if (!license) {
          unprocessed.push(payment);
        }
      }
    }

    return unprocessed;
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

  private findDevice(devices: Device[], deviceId: string) {
    return devices.find((d) => d.deviceId === deviceId);
  }

  private async findDeviceByCompositeKey(licenseId: string, deviceId: string) {
    return this.prisma.device.findUnique({
      where: { licenseId_deviceId: { licenseId, deviceId } },
    });
  }

  private validateLicenseStatus(license: LicenseWithDevices) {
    if (license.status !== 'ACTIVE') {
      throw new BadRequestException(`License is ${license.status}`);
    }
  }

  private async checkExpiration(license: License) {
    if (license.expiresAt && license.expiresAt < new Date()) {
      await this.prisma.license.update({
        where: { id: license.id },
        data: { status: 'EXPIRED' },
      });
      throw new BadRequestException('License has expired');
    }
  }

  private async isExpired(license: License) {
    if (license.expiresAt && license.expiresAt < new Date()) {
      await this.prisma.license.update({
        where: { id: license.id },
        data: { status: 'EXPIRED' },
      });
      return true;
    }
    return false;
  }

  private validateDeviceLimit(license: LicenseWithDevices) {
    if (license.devices.length >= license.maxDevices) {
      throw new BadRequestException(
        `Maximum device limit of ${license.maxDevices} reached. Please deactivate an existing device first`,
      );
    }
  }

  private async reactivateDevice(
    license: LicenseWithDevices,
    device: Device,
    dto: ActivateLicenseDto,
    ipAddress?: string,
  ): Promise<ActivationResponse> {
    await this.updateDeviceLastSeen(device.id, ipAddress);
    await this.logAction(this.prisma, {
      licenseId: license.id,
      action: 'DEVICE_REACTIVATED',
      licenseKey: dto.licenseKey,
      deviceId: dto.deviceId,
      ipAddress,
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
    await this.createDevice(license.id, dto, ipAddress);
    await this.logAction(this.prisma, {
      licenseId: license.id,
      action: 'DEVICE_ACTIVATED',
      licenseKey: dto.licenseKey,
      deviceId: dto.deviceId,
      ipAddress,
      metadata: dto.deviceInfo,
    });

    return {
      success: true,
      message: 'Activated successfully',
      license: this.buildLicenseResponse(
        license,
        license.devices.length + 1,
      ),
    };
  }

  private async createDevice(
    licenseId: string,
    dto: ActivateLicenseDto,
    ipAddress?: string,
  ) {
    return this.prisma.device.create({
      data: {
        licenseId,
        deviceId: dto.deviceId,
        deviceName: dto.deviceInfo?.name ?? 'Unknown',
        browserInfo: dto.deviceInfo?.browser,
        ipAddress,
      },
    });
  }

  private async updateDeviceLastSeen(deviceId: string, ipAddress?: string) {
    return this.prisma.device.update({
      where: { id: deviceId },
      data: { lastSeenAt: new Date(), ipAddress },
    });
  }

  private async removeDevice(deviceId: string) {
    return this.prisma.device.delete({ where: { id: deviceId } });
  }

  private async updateLicenseStatus(
    licenseId: string,
    status: string,
    logData: any,
  ) {
    return this.prisma.$transaction([
      this.prisma.license.update({
        where: { id: licenseId },
        data: { status: status as any },
      }),
      this.prisma.licenseLog.create({
        data: { licenseId, ...logData },
      }),
    ]);
  }

  private async logAction(tx: any, data: any) {
    return tx.licenseLog.create({ data });
  }

  private async logFailedActivation(
    dto: ActivateLicenseDto,
    ipAddress: string | undefined,
    reason: string,
  ) {
    await this.prisma.licenseLog.create({
      data: {
        action: 'ACTIVATION_FAILED',
        licenseKey: dto.licenseKey,
        deviceId: dto.deviceId,
        ipAddress,
        metadata: { reason },
      },
    });
  }

  private async logDeactivation(
    license: License,
    dto: DeactivateLicenseDto,
    ipAddress?: string,
  ) {
    await this.prisma.licenseLog.create({
      data: {
        licenseId: license.id,
        action: 'DEVICE_DEACTIVATED',
        licenseKey: dto.licenseKey,
        deviceId: dto.deviceId,
        ipAddress,
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
