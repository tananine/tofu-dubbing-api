export type JsonValue =
  | string
  | number
  | boolean
  | null
  | { [key: string]: JsonValue }
  | JsonValue[];

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
