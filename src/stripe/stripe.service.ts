import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { LicenseService } from '../license/license.service.js';

@Injectable()
export class StripeService {
  private readonly stripe: Stripe;
  private readonly logger = new Logger(StripeService.name);
  private readonly DEFAULT_MAX_DEVICES = 2;

  constructor(
    private readonly configService: ConfigService,
    private readonly licenseService: LicenseService,
  ) {
    this.stripe = this.initializeStripe();
  }

  private initializeStripe(): Stripe {
    const apiKey = this.getRequiredConfig('STRIPE_SECRET_KEY');
    return new Stripe(apiKey, { apiVersion: '2025-11-17.clover' });
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
    const handlers: Record<string, (data: any) => Promise<void>> = {
      'payment_intent.succeeded': (data) => this.handlePaymentSuccess(data),
      'charge.refunded': (data) => this.handleRefund(data),
      'payment_intent.payment_failed': (data) =>
        this.logPaymentFailure(data),
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
        `Missing email in payment metadata: ${paymentIntent.id}`,
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
      this.logger.warn(`Refund without payment_intent: ${charge.id}`);
      return;
    }

    await this.licenseService.refundLicense(charge.payment_intent as string);
  }

  private async logPaymentFailure(paymentIntent: Stripe.PaymentIntent) {
    this.logger.warn(`Payment failed: ${paymentIntent.id}`);
  }

  private parseMaxDevices(value?: string): number {
    if (!value) return this.DEFAULT_MAX_DEVICES;
    const parsed = parseInt(value, 10);
    return isNaN(parsed) ? this.DEFAULT_MAX_DEVICES : parsed;
  }

  async getUnprocessedPayments(days = 7) {
    return this.licenseService.getUnprocessedPayments(this.stripe, days);
  }
}
