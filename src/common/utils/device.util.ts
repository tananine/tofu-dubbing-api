import type { Device } from '../../../generated/prisma/client.js';

export function findDeviceById(devices: Device[], deviceId: string): Device | undefined {
  return devices.find((device) => device.deviceId === deviceId);
}

export function findOldestDevice(devices: Device[]): Device | null {
  if (devices.length === 0) {
    return null;
  }

  return devices.reduce((oldest, current) => {
    const oldestTimestamp = new Date(oldest.lastSeenAt).getTime();
    const currentTimestamp = new Date(current.lastSeenAt).getTime();
    return currentTimestamp < oldestTimestamp ? current : oldest;
  });
}

export function extractFingerprint(metadata: unknown): string | undefined {
  if (!metadata || typeof metadata !== 'object') {
    return undefined;
  }

  const metadataObj = metadata as { fingerprint?: string };
  return metadataObj.fingerprint;
}

export function createFingerprintMetadata(fingerprint: string): { fingerprint: string } {
  return { fingerprint };
}

