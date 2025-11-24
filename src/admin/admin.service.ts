import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type { LicenseStatus } from '../../generated/prisma/client.js';
import { randomBytes } from 'crypto';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async getStats() {
    const [
      totalLicenses,
      activeLicenses,
      totalDevices,
      recentLogs,
      licensesByStatus,
    ] = await Promise.all([
      this.prisma.license.count(),
      this.prisma.license.count({ where: { status: 'ACTIVE' } }),
      this.prisma.device.count(),
      this.prisma.licenseLog.count({
        where: {
          createdAt: {
            gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
          },
        },
      }),
      this.prisma.license.groupBy({
        by: ['status'],
        _count: true,
      }),
    ]);

    return {
      totalLicenses,
      activeLicenses,
      totalDevices,
      recentLogs,
      licensesByStatus: licensesByStatus.reduce(
        (acc, item) => {
          acc[item.status] = item._count;
          return acc;
        },
        {} as Record<string, number>,
      ),
    };
  }

  async getAllLicenses(page = 1, limit = 50, status?: LicenseStatus) {
    const skip = (page - 1) * limit;
    const where = status ? { status } : {};

    const [licenses, total] = await Promise.all([
      this.prisma.license.findMany({
        where,
        include: {
          devices: {
            select: {
              id: true,
              deviceId: true,
              deviceName: true,
              lastSeenAt: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.license.count({ where }),
    ]);

    return {
      licenses,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getLicenseById(id: string) {
    return this.prisma.license.findUnique({
      where: { id },
      include: {
        devices: {
          orderBy: { activatedAt: 'desc' },
        },
        logs: {
          orderBy: { createdAt: 'desc' },
          take: 50,
        },
      },
    });
  }

  async updateLicenseStatus(id: string, status: LicenseStatus, reason?: string) {
    return this.prisma.$transaction([
      this.prisma.license.update({
        where: { id },
        data: { status },
      }),
      this.prisma.licenseLog.create({
        data: {
          licenseId: id,
          action: `LICENSE_STATUS_CHANGED_${status}`,
          metadata: { reason, changedBy: 'ADMIN' },
        },
      }),
    ]);
  }

  async updateLicenseExpiry(id: string, expiresAt: Date | null) {
    return this.prisma.license.update({
      where: { id },
      data: { expiresAt },
    });
  }

  async updateMaxDevices(id: string, maxDevices: number) {
    return this.prisma.license.update({
      where: { id },
      data: { maxDevices },
    });
  }

  async getAllDevices(page = 1, limit = 50) {
    const skip = (page - 1) * limit;

    const [devices, total] = await Promise.all([
      this.prisma.device.findMany({
        include: {
          license: {
            select: {
              licenseKey: true,
              email: true,
              status: true,
            },
          },
        },
        orderBy: { lastSeenAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.device.count(),
    ]);

    return {
      devices,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async removeDevice(deviceId: string) {
    const device = await this.prisma.device.findUnique({
      where: { id: deviceId },
      include: { license: true },
    });

    if (!device) {
      return { success: false, message: 'Device not found' };
    }

    await this.prisma.$transaction([
      this.prisma.device.delete({
        where: { id: deviceId },
      }),
      this.prisma.licenseLog.create({
        data: {
          licenseId: device.licenseId,
          action: 'DEVICE_REMOVED_BY_ADMIN',
          deviceId: device.deviceId,
          metadata: { removedBy: 'ADMIN' },
        },
      }),
    ]);

    return { success: true, message: 'Device removed' };
  }

  async getLogs(page = 1, limit = 100, action?: string) {
    const skip = (page - 1) * limit;
    const where = action ? { action } : {};

    const [logs, total] = await Promise.all([
      this.prisma.licenseLog.findMany({
        where,
        include: {
          license: {
            select: {
              licenseKey: true,
              email: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.licenseLog.count({ where }),
    ]);

    return {
      logs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async searchLicenses(query: string) {
    return this.prisma.license.findMany({
      where: {
        OR: [
          { licenseKey: { contains: query, mode: 'insensitive' } },
          { email: { contains: query, mode: 'insensitive' } },
          { stripePaymentId: { contains: query, mode: 'insensitive' } },
        ],
      },
      include: {
        devices: {
          select: {
            id: true,
            deviceId: true,
            deviceName: true,
            lastSeenAt: true,
          },
        },
      },
      take: 20,
    });
  }

  async deleteLicense(id: string) {
    await this.prisma.license.delete({
      where: { id },
    });

    return { success: true, message: 'License deleted' };
  }

  private generateLicenseKey(): string {
    const prefix = 'TF';
    const randomPart = randomBytes(16).toString('hex').toUpperCase();
    return `${prefix}-${randomPart.slice(0, 8)}-${randomPart.slice(8, 16)}-${randomPart.slice(16, 24)}-${randomPart.slice(24, 32)}`;
  }

  async createLicense(data: {
    email: string;
    stripePaymentId?: string;
    maxDevices?: number;
    expiresAt?: Date;
  }) {
    const licenseKey = this.generateLicenseKey();

    const license = await this.prisma.license.create({
      data: {
        licenseKey,
        email: data.email,
        stripePaymentId: data.stripePaymentId,
        maxDevices: data.maxDevices || 3,
        expiresAt: data.expiresAt,
        status: 'ACTIVE',
      },
    });

    await this.prisma.licenseLog.create({
      data: {
        licenseId: license.id,
        action: 'LICENSE_CREATED_BY_ADMIN',
        metadata: { createdBy: 'ADMIN' },
      },
    });

    return license;
  }
}

