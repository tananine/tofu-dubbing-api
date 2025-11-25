import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type { LicenseStatus } from '../../generated/prisma/client.js';
import {
  LICENSE_CONSTANTS,
  LICENSE_STATUS,
  LICENSE_ACTIONS,
  PAGINATION_DEFAULTS,
} from '../common/constants.js';
import { LicenseNotFoundException } from '../common/exceptions/license.exceptions.js';
import { generateLicenseKey } from '../common/utils/license-key.util.js';
import {
  calculateSkip,
  createPaginationResult,
} from '../common/utils/pagination.util.js';

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
      this.prisma.license.count({ where: { status: LICENSE_STATUS.ACTIVE } }),
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

  async getAllLicenses(
    page: number = PAGINATION_DEFAULTS.PAGE,
    limit: number = PAGINATION_DEFAULTS.LICENSE_LIMIT,
    status?: LicenseStatus,
  ) {
    const skip = calculateSkip(page, limit);
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

    return createPaginationResult(licenses, total, { page, limit });
  }

  async getLicenseById(id: string) {
    const license = await this.prisma.license.findUnique({
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

    if (!license) {
      throw new LicenseNotFoundException();
    }

    return license;
  }

  async updateLicenseStatus(
    id: string,
    status: LicenseStatus,
    reason?: string,
  ) {
    const license = await this.prisma.license.findUnique({ where: { id } });

    if (!license) {
      throw new LicenseNotFoundException();
    }

    return this.prisma.$transaction([
      this.prisma.license.update({
        where: { id },
        data: { status },
      }),
      this.prisma.licenseLog.create({
        data: {
          licenseId: id,
          action: `${LICENSE_ACTIONS.LICENSE_STATUS_CHANGED}_${status}`,
          metadata: { reason, changedBy: 'ADMIN' },
        },
      }),
    ]);
  }

  async updateLicenseExpiry(id: string, expiresAt: Date | null) {
    const license = await this.prisma.license.findUnique({ where: { id } });

    if (!license) {
      throw new LicenseNotFoundException();
    }

    return this.prisma.license.update({
      where: { id },
      data: { expiresAt },
    });
  }

  async updateMaxDevices(id: string, maxDevices: number) {
    const license = await this.prisma.license.findUnique({ where: { id } });

    if (!license) {
      throw new LicenseNotFoundException();
    }

    return this.prisma.license.update({
      where: { id },
      data: { maxDevices },
    });
  }

  async getAllDevices(
    page: number = PAGINATION_DEFAULTS.PAGE,
    limit: number = PAGINATION_DEFAULTS.DEVICE_LIMIT,
  ) {
    const skip = calculateSkip(page, limit);

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

    return createPaginationResult(devices, total, { page, limit });
  }

  async removeDevice(deviceId: string) {
    const device = await this.prisma.device.findUnique({
      where: { id: deviceId },
      include: { license: true },
    });

    if (!device) {
      throw new LicenseNotFoundException();
    }

    await this.prisma.$transaction([
      this.prisma.device.delete({
        where: { id: deviceId },
      }),
      this.prisma.licenseLog.create({
        data: {
          licenseId: device.licenseId,
          action: LICENSE_ACTIONS.DEVICE_REMOVED_BY_ADMIN,
          deviceId: device.deviceId,
          metadata: { removedBy: 'ADMIN' },
        },
      }),
    ]);

    return { success: true, message: 'Device removed' };
  }

  async getLogs(
    page: number = PAGINATION_DEFAULTS.PAGE,
    limit: number = PAGINATION_DEFAULTS.LOG_LIMIT,
    action?: string,
  ) {
    const skip = calculateSkip(page, limit);
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

    return createPaginationResult(logs, total, { page, limit });
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
      take: PAGINATION_DEFAULTS.SEARCH_LIMIT,
    });
  }

  async deleteLicense(id: string) {
    const license = await this.prisma.license.findUnique({ where: { id } });

    if (!license) {
      throw new LicenseNotFoundException();
    }

    await this.prisma.license.delete({
      where: { id },
    });

    return { success: true, message: 'License deleted' };
  }

  async createLicense(data: {
    email: string;
    stripePaymentId?: string;
    maxDevices?: number;
    expiresAt?: Date;
  }) {
    const licenseKey = generateLicenseKey();

    const license = await this.prisma.license.create({
      data: {
        licenseKey,
        email: data.email,
        stripePaymentId: data.stripePaymentId,
        maxDevices:
          data.maxDevices ?? LICENSE_CONSTANTS.ADMIN_DEFAULT_MAX_DEVICES,
        expiresAt: data.expiresAt,
        status: LICENSE_STATUS.ACTIVE,
      },
    });

    await this.prisma.licenseLog.create({
      data: {
        licenseId: license.id,
        action: LICENSE_ACTIONS.LICENSE_CREATED_BY_ADMIN,
        metadata: { createdBy: 'ADMIN' },
      },
    });

    return license;
  }
}
