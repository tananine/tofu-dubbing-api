import type { License } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { LICENSE_STATUS } from '../constants.js';
import { LicenseExpiredException } from '../exceptions/license.exceptions.js';

export async function checkAndUpdateExpiration(
  prisma: PrismaService,
  license: License,
): Promise<void> {
  if (!license.expiresAt) {
    return;
  }

  const now = new Date();
  if (license.expiresAt < now) {
    await prisma.license.update({
      where: { id: license.id },
      data: { status: LICENSE_STATUS.EXPIRED },
    });
    throw new LicenseExpiredException();
  }
}

export async function isLicenseExpired(
  prisma: PrismaService,
  license: License,
): Promise<boolean> {
  if (!license.expiresAt) {
    return false;
  }

  const now = new Date();
  if (license.expiresAt < now) {
    await prisma.license.update({
      where: { id: license.id },
      data: { status: LICENSE_STATUS.EXPIRED },
    });
    return true;
  }

  return false;
}

