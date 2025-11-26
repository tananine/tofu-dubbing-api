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
      case 'checkout.session.completed':
        await this.handleCheckoutComplete(event.data.object);
        break;
      case 'charge.dispute.created':
        await this.handleDispute(event.data.object);
        break;
      default:
        this.logger.log(`Unhandled event type: ${event.type}`);
    }
  }

  private async handleCheckoutComplete(
    session: Stripe.Checkout.Session,
  ): Promise<void> {
    const email =
      session.customer_email || session.customer_details?.email || null;

    if (!email) {
      this.logger.error(
        `${ERROR_CODES.MISSING_EMAIL_IN_PAYMENT}: ${session.id}`,
      );
      return;
    }

    const maxDevices = this.parseMaxDevices(session.metadata?.maxDevices);

    await this.licenseService.createLicense({
      email,
      stripePaymentId: session.payment_intent as string,
      stripeCustomerId: session.customer as string,
      maxDevices,
    });
  }

  private async handleDispute(dispute: Stripe.Dispute): Promise<void> {
    const paymentIntentId = dispute.payment_intent as string;

    if (!paymentIntentId) {
      this.logger.warn(`Dispute without payment_intent: ${dispute.id}`);
      return;
    }

    await this.licenseService.suspendLicenseByPayment(paymentIntentId);
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
