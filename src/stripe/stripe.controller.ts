import { Controller, Post, Headers, Req } from '@nestjs/common';
import { StripeService } from './stripe.service.js';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import {
  MissingWebhookSignatureException,
  MissingRawBodyException,
  WebhookProcessingException,
} from '../common/exceptions/stripe.exceptions.js';

@Controller('stripe')
export class StripeController {
  constructor(private readonly stripeService: StripeService) {}

  @Post('webhook')
  async handleWebhook(
    @Headers('stripe-signature') signature: string,
    @Req() req: RawBodyRequest<Request>,
  ) {
    if (!signature) {
      throw new MissingWebhookSignatureException();
    }

    if (!req.rawBody) {
      throw new MissingRawBodyException();
    }

    try {
      return await this.stripeService.handleWebhook(signature, req.rawBody);
    } catch (error) {
      throw new WebhookProcessingException(
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }
}
