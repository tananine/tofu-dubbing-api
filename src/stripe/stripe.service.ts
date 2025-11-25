import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { LicenseService } from '../license/license.service.js';
import {
  LICENSE_CONSTANTS,
  STRIPE_API_VERSION,
  ERROR_CODES,
} from '../common/constants.js';

@Injectable()
export class StripeService {
  private readonly stripe: Stripe;
  private readonly logger = new Logger(StripeService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly licenseService: LicenseService,
  ) {
    this.stripe = new Stripe(this.getConfig('STRIPE_SECRET_KEY'), {
      apiVersion: STRIPE_API_VERSION,
    });
  }

  async handleWebhook(signature: string, rawBody: Buffer) {
    const event = this.stripe.webhooks.constructEvent(
      rawBody,
      signature,
      this.getConfig('STRIPE_WEBHOOK_SECRET'),
    );

    await this.processEvent(event);

    return { received: true };
  }

  private async processEvent(event: Stripe.Event): Promise<void> {
    switch (event.type) {
      case 'payment_intent.succeeded':
        await this.handlePaymentSuccess(event.data.object);
        break;
      case 'charge.refunded':
        await this.handleRefund(event.data.object);
        break;
      case 'payment_intent.payment_failed':
        this.logger.warn(`Payment failed: ${event.data.object.id}`);
        break;
      default:
        this.logger.log(`Unhandled event type: ${event.type}`);
    }
  }

  private async handlePaymentSuccess(
    paymentIntent: Stripe.PaymentIntent,
  ): Promise<void> {
    const email = paymentIntent.metadata?.email;

    if (!email) {
      this.logger.error(
        `${ERROR_CODES.MISSING_EMAIL_IN_PAYMENT}: ${paymentIntent.id}`,
      );
      return;
    }

    await this.licenseService.createLicense({
      email,
      stripePaymentId: paymentIntent.id,
      stripeCustomerId: paymentIntent.customer as string,
      maxDevices: this.parseMaxDevices(paymentIntent.metadata?.maxDevices),
    });
  }

  private async handleRefund(charge: Stripe.Charge): Promise<void> {
    if (!charge.payment_intent) {
      this.logger.warn(
        `${ERROR_CODES.REFUND_WITHOUT_PAYMENT_INTENT}: ${charge.id}`,
      );
      return;
    }

    await this.licenseService.refundLicense(charge.payment_intent as string);
  }

  private getConfig(key: string): string {
    const value = this.config.get<string>(key);
    if (!value) {
      throw new Error(`${key} is not configured`);
    }
    return value;
  }

  private parseMaxDevices(value?: string): number {
    if (!value) {
      return LICENSE_CONSTANTS.DEFAULT_MAX_DEVICES;
    }
    const parsed = parseInt(value, 10);
    return isNaN(parsed) ? LICENSE_CONSTANTS.DEFAULT_MAX_DEVICES : parsed;
  }
}
