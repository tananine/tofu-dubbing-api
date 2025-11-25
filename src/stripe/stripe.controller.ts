import {
  Controller,
  Post,
  Get,
  Headers,
  Req,
  Query,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import { StripeService } from './stripe.service.js';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import {
  MissingWebhookSignatureException,
  MissingRawBodyException,
  WebhookProcessingException,
} from '../common/exceptions/stripe.exceptions.js';
import { STRIPE_CONFIG } from '../common/constants.js';

@Controller('stripe')
export class StripeController {
  constructor(private readonly stripeService: StripeService) {}

  @Post('webhook')
  async handleWebhook(
    @Headers('stripe-signature') signature: string,
    @Req() req: RawBodyRequest<Request>,
  ) {
    this.validateWebhookRequest(signature, req.rawBody);

    try {
      return await this.stripeService.handleWebhook(signature, req.rawBody!);
    } catch (error) {
      throw new WebhookProcessingException(
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }

  @Get('admin/unprocessed-payments')
  getUnprocessedPayments(
    @Query('days', new DefaultValuePipe(STRIPE_CONFIG.UNPROCESSED_PAYMENTS_DAYS), ParseIntPipe)
    days: number,
  ) {
    return this.stripeService.getUnprocessedPayments(days);
  }

  private validateWebhookRequest(
    signature: string | undefined,
    rawBody: Buffer | undefined,
  ) {
    if (!signature) {
      throw new MissingWebhookSignatureException();
    }

    if (!rawBody) {
      throw new MissingRawBodyException();
    }
  }
}
