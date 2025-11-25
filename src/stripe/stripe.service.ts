import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { LicenseService } from '../license/license.service.js';
import {
  LICENSE_CONSTANTS,
  STRIPE_CONFIG,
  ERROR_CODES,
} from '../common/constants.js';

@Injectable()
export class StripeService {
  private readonly stripe: Stripe;
  private readonly logger = new Logger(StripeService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly licenseService: LicenseService,
  ) {
    this.stripe = this.initializeStripe();
  }

  private initializeStripe(): Stripe {
    const apiKey = this.getRequiredConfig('STRIPE_SECRET_KEY');
    return new Stripe(apiKey, { apiVersion: STRIPE_CONFIG.API_VERSION });
  }

  private getRequiredConfig(key: string): string {
    const value = this.configService.get<string>(key);
    if (!value) {
      throw new Error(`${key} is not configured`);
    }
    return value;
  }

  async handleWebhook(signature: string, rawBody: Buffer) {
    const webhookSecret = this.getRequiredConfig('STRIPE_WEBHOOK_SECRET');
    const event = this.stripe.webhooks.constructEvent(
      rawBody,
      signature,
      webhookSecret,
    );

    await this.processEvent(event);

    return { received: true };
  }

  private async processEvent(event: Stripe.Event) {
    const handlers: Record<string, (data: unknown) => Promise<void>> = {
      'payment_intent.succeeded': (data) =>
        this.handlePaymentSuccess(data as Stripe.PaymentIntent),
      'charge.refunded': (data) => this.handleRefund(data as Stripe.Charge),
      'payment_intent.payment_failed': (data) =>
        this.logPaymentFailure(data as Stripe.PaymentIntent),
    };

    const handler = handlers[event.type];

    if (handler) {
      await handler(event.data.object);
    } else {
      this.logger.log(`Unhandled event type: ${event.type}`);
    }
  }

  private async handlePaymentSuccess(paymentIntent: Stripe.PaymentIntent) {
    const email = paymentIntent.metadata?.email;

    if (!email) {
      this.logger.error(
        `${ERROR_CODES.MISSING_EMAIL_IN_PAYMENT}: ${paymentIntent.id}`,
      );
      return;
    }

    const maxDevices = this.parseMaxDevices(paymentIntent.metadata?.maxDevices);

    await this.licenseService.createLicense({
      email,
      stripePaymentId: paymentIntent.id,
      stripeCustomerId: paymentIntent.customer as string,
      maxDevices,
    });
  }

  private async handleRefund(charge: Stripe.Charge) {
    if (!charge.payment_intent) {
      this.logger.warn(
        `${ERROR_CODES.REFUND_WITHOUT_PAYMENT_INTENT}: ${charge.id}`,
      );
      return;
    }

    await this.licenseService.refundLicense(charge.payment_intent as string);
  }

  private async logPaymentFailure(paymentIntent: Stripe.PaymentIntent) {
    this.logger.warn(`Payment failed: ${paymentIntent.id}`);
  }

  private parseMaxDevices(value?: string): number {
    if (!value) {
      return LICENSE_CONSTANTS.DEFAULT_MAX_DEVICES;
    }
    const parsed = parseInt(value, 10);
    return isNaN(parsed)
      ? LICENSE_CONSTANTS.DEFAULT_MAX_DEVICES
      : parsed;
  }
}
