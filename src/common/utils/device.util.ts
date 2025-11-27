import type { Device } from '../../db/schema.js';
import type { JsonValue } from '../types/index.js';

export function findDeviceById(
  devices: Device[],
  deviceId: string,
): Device | undefined {
  return devices.find((device) => device.deviceId === deviceId);
}

export function findOldestDevice(devices: Device[]): Device | undefined {
  if (devices.length === 0) {
    return undefined;
  }

  return devices.reduce((oldest, current) =>
    current.lastSeenAt < oldest.lastSeenAt ? current : oldest,
  );
}

export function extractFingerprint(metadata: unknown): string | undefined {
  if (!metadata || typeof metadata !== 'object') {
    return undefined;
  }
  return (metadata as { fingerprint?: string }).fingerprint;
}

export function createFingerprintMetadata(fingerprint: string): JsonValue {
  return { fingerprint };
}
