import { createHash } from 'crypto';

const SECRET_SALT = process.env.SECRET_SALT || '';

export function generateVerificationToken(
  licenseKey: string,
  deviceId: string,
  timestamp: number,
): string {
  const data = `${licenseKey}:${deviceId}:${timestamp}:${SECRET_SALT}`;
  return createHash('sha256').update(data).digest('hex');
}
