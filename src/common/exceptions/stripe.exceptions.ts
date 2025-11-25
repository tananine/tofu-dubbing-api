import { BadRequestException } from '@nestjs/common';
import { ERROR_CODES } from '../constants.js';

export class MissingWebhookSignatureException extends BadRequestException {
  constructor() {
    super({
      code: ERROR_CODES.MISSING_WEBHOOK_SIGNATURE,
      message: 'Missing stripe-signature header',
    });
  }
}

export class MissingRawBodyException extends BadRequestException {
  constructor() {
    super({
      code: ERROR_CODES.MISSING_RAW_BODY,
      message: 'Missing raw body',
    });
  }
}

export class WebhookProcessingException extends BadRequestException {
  constructor(originalError: Error) {
    super({
      code: ERROR_CODES.WEBHOOK_PROCESSING_ERROR,
      message: `Webhook processing failed: ${originalError.message}`,
    });
  }
}

