import {
  Controller,
  Post,
  Get,
  Headers,
  BadRequestException,
  Req,
  Query,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import { StripeService } from './stripe.service.js';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';

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
    } catch (err) {
      throw new BadRequestException(`Webhook Error: ${err.message}`);
    }
  }

  @Get('admin/unprocessed-payments')
  getUnprocessedPayments(
    @Query('days', new DefaultValuePipe(7), ParseIntPipe) days: number,
  ) {
    return this.stripeService.getUnprocessedPayments(days);
  }

  private validateWebhookRequest(
    signature: string | undefined,
    rawBody: Buffer | undefined,
  ) {
    if (!signature) {
      throw new BadRequestException('Missing stripe-signature header');
    }

    if (!rawBody) {
      throw new BadRequestException('Missing raw body');
    }
  }
}
