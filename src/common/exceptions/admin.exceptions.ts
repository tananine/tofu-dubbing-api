import { UnauthorizedException } from '@nestjs/common';
import { ERROR_CODES } from '../constants.js';

export class AdminKeyNotConfiguredException extends UnauthorizedException {
  constructor() {
    super({
      code: ERROR_CODES.ADMIN_KEY_NOT_CONFIGURED,
      message: 'Admin key not configured',
    });
  }
}

export class InvalidAuthorizationHeaderException extends UnauthorizedException {
  constructor() {
    super({
      code: ERROR_CODES.INVALID_AUTHORIZATION_HEADER,
      message: 'Invalid authorization header',
    });
  }
}

export class InvalidAdminKeyException extends UnauthorizedException {
  constructor() {
    super({
      code: ERROR_CODES.INVALID_ADMIN_KEY,
      message: 'Invalid admin key',
    });
  }
}

