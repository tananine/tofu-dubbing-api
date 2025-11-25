import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ERROR_CODES } from '../constants.js';

export class LicenseNotFoundException extends NotFoundException {
  constructor() {
    super({
      code: ERROR_CODES.LICENSE_NOT_FOUND,
      message: 'License not found',
    });
  }
}

export class InvalidLicenseKeyException extends NotFoundException {
  constructor() {
    super({
      code: ERROR_CODES.INVALID_LICENSE_KEY,
      message: 'Invalid license key',
    });
  }
}

export class LicenseNotActiveException extends BadRequestException {
  constructor(status: string) {
    super({
      code: ERROR_CODES.LICENSE_NOT_ACTIVE,
      message: `License is ${status}`,
      status,
    });
  }
}

export class LicenseExpiredException extends BadRequestException {
  constructor() {
    super({
      code: ERROR_CODES.LICENSE_EXPIRED,
      message: 'License has expired',
    });
  }
}

export class DeviceNotFoundException extends NotFoundException {
  constructor() {
    super({
      code: ERROR_CODES.DEVICE_NOT_FOUND,
      message: 'Device not found',
    });
  }
}

export class FingerprintMismatchException extends BadRequestException {
  constructor() {
    super({
      code: ERROR_CODES.FINGERPRINT_MISMATCH,
      message: 'Device fingerprint mismatch',
    });
  }
}
