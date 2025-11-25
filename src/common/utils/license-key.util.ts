import { randomBytes } from 'crypto';
import { LICENSE_CONSTANTS } from '../constants.js';

export function generateLicenseKey(
  prefix: string = LICENSE_CONSTANTS.KEY_PREFIX,
): string {
  const randomPart = randomBytes(LICENSE_CONSTANTS.KEY_RANDOM_BYTES)
    .toString('hex')
    .toUpperCase();

  const segments = randomPart.match(
    new RegExp(`.{1,${LICENSE_CONSTANTS.KEY_SEGMENT_LENGTH}}`, 'g'),
  );

  if (!segments) {
    throw new Error('Failed to generate license key segments');
  }

  return `${prefix}-${segments.join('-')}`;
}
