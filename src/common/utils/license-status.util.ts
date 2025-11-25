import type { License } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { LICENSE_STATUS } from '../constants.js';
import { LicenseExpiredException } from '../exceptions/license.exceptions.js';

export async function validateLicenseExpiration(
  prisma: PrismaService,
  license: License,
  throwOnExpired: boolean = true,
): Promise<boolean> {
  if (!license.expiresAt) {
    return false;
  }

  const isExpired = license.expiresAt < new Date();

  if (isExpired) {
    await prisma.license.update({
      where: { id: license.id },
      data: { status: LICENSE_STATUS.EXPIRED },
    });

    if (throwOnExpired) {
      throw new LicenseExpiredException();
    }
  }

  return isExpired;
}
