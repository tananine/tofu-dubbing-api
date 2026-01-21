import {
  Controller,
  Post,
  Headers,
  BadRequestException,
  Req,
  Logger,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import Stripe from 'stripe';
import { SubscriptionsService } from '../subscriptions/subscriptions.service.js';
import { MessageCodes } from '../common/message-codes.js';
import {
  StripeSubscriptionExtended,
  StripeInvoiceExtended,
  ExtractedSubscriptionData,
} from './types/stripe-extended.types.js';

@Controller('webhooks')
export class StripeWebhookController {
  private readonly logger = new Logger(StripeWebhookController.name);
  private stripe: Stripe;

  constructor(
    private subscriptionsService: SubscriptionsService,
    private configService: ConfigService,
  ) {
    this.stripe = new Stripe(
      this.configService.get<string>('STRIPE_SECRET_KEY')!,
    );
  }

  @Post('stripe')
  async handleStripeWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string,
  ) {
    const webhookSecret = this.configService.get<string>(
      'STRIPE_WEBHOOK_SECRET',
    );

    if (!webhookSecret) {
      throw new BadRequestException(MessageCodes.WEBHOOK_SECRET_NOT_CONFIGURED);
    }

    let event: Stripe.Event;

    try {
      event = this.stripe.webhooks.constructEvent(
        req.rawBody!,
        signature,
        webhookSecret,
      );
    } catch (err) {
      throw new BadRequestException(MessageCodes.INVALID_SIGNATURE);
    }

    try {
      await this.processWebhookEvent(event);
    } catch (error) {
      this.logger.error('Error handling webhook event', {
        type: event.type,
        error: error instanceof Error ? error.message : error,
      });
    }

    return { received: true };
  }

  private async processWebhookEvent(event: Stripe.Event): Promise<void> {
    switch (event.type) {
      case 'checkout.session.completed':
        await this.handleCheckoutSessionCompleted(
          event.data.object as Stripe.Checkout.Session,
        );
        break;

      case 'customer.subscription.updated':
        await this.handleSubscriptionUpdated(
          event.data.object as StripeSubscriptionExtended,
        );
        break;

      case 'customer.subscription.deleted':
        await this.handleSubscriptionDeleted(
          event.data.object as StripeSubscriptionExtended,
        );
        break;

      case 'invoice.payment_succeeded':
        await this.handleInvoicePaymentSucceeded(
          event.data.object as StripeInvoiceExtended,
        );
        break;

      case 'invoice.payment_failed':
        await this.handleInvoicePaymentFailed(
          event.data.object as StripeInvoiceExtended,
        );
        break;
    }
  }

  private async handleCheckoutSessionCompleted(
    session: Stripe.Checkout.Session,
  ): Promise<void> {
    const userId = session.client_reference_id;
    const customerId = session.customer as string;
    const subscriptionId = session.subscription as string;

    if (!userId) {
      this.logger.error('Missing userId in checkout session');
      return;
    }

    if (!subscriptionId) {
      this.logger.error('Missing subscription ID in checkout session');
      return;
    }

    try {
      const stripeSubscription: any = await this.stripe.subscriptions.retrieve(
        subscriptionId,
        {
          expand: ['items.data.price', 'latest_invoice.lines'],
        }
      );
      
      const priceId = stripeSubscription.items?.data?.[0]?.price?.id;
      const planInterval = stripeSubscription.items?.data?.[0]?.price?.recurring?.interval;
      
      let currentPeriodStart = stripeSubscription.current_period_start;
      let currentPeriodEnd = stripeSubscription.current_period_end;
      
      if (!currentPeriodStart || !currentPeriodEnd) {
        const invoice: any = stripeSubscription.latest_invoice;
        
        if (invoice && typeof invoice === 'object' && invoice.lines?.data?.[0]) {
          const lineItem = invoice.lines.data[0];
          currentPeriodStart = lineItem.period?.start;
          currentPeriodEnd = lineItem.period?.end;
        }
      }
      
      if (!currentPeriodStart || !currentPeriodEnd) {
        this.logger.error('Cannot find valid period timestamps');
        return;
      }

      await this.subscriptionsService.createOrUpdate({
        userId: parseInt(userId, 10),
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscriptionId,
        stripePriceId: priceId,
        planInterval: planInterval,
        status: stripeSubscription.status,
        currentPeriodStart: new Date(currentPeriodStart * 1000),
        currentPeriodEnd: new Date(currentPeriodEnd * 1000),
        cancelAtPeriodEnd: stripeSubscription.cancel_at_period_end,
      });
    } catch (error) {
      this.logger.error('Error in handleCheckoutSessionCompleted', {
        error: error instanceof Error ? error.message : error,
        userId,
        subscriptionId,
      });
      throw error;
    }
  }

  private async handleSubscriptionUpdated(
    stripeSubscription: StripeSubscriptionExtended,
  ): Promise<void> {
    const subscriptionData = this.extractSubscriptionData(stripeSubscription);

    if (!this.validateSubscriptionPeriod(subscriptionData)) {
      return;
    }

    await this.subscriptionsService.updateByStripeSubscriptionId(
      stripeSubscription.id,
      {
        status: subscriptionData.status,
        stripePriceId: subscriptionData.priceId,
        planInterval: subscriptionData.planInterval,
        currentPeriodStart: new Date(subscriptionData.currentPeriodStart * 1000),
        currentPeriodEnd: new Date(subscriptionData.currentPeriodEnd * 1000),
        cancelAtPeriodEnd: subscriptionData.cancelAtPeriodEnd,
      },
    );
  }

  private async handleSubscriptionDeleted(
    stripeSubscription: StripeSubscriptionExtended,
  ): Promise<void> {
    await this.subscriptionsService.updateByStripeSubscriptionId(
      stripeSubscription.id,
      {
        status: 'canceled',
      },
    );
  }

  private async handleInvoicePaymentSucceeded(
    invoice: StripeInvoiceExtended,
  ): Promise<void> {
    const subscriptionId = invoice.subscription;
    if (!subscriptionId || typeof subscriptionId !== 'string') {
      return;
    }

    const stripeSubscription = await this.retrieveSubscription(subscriptionId);
    const subscriptionData = this.extractSubscriptionData(stripeSubscription);

    if (!this.validateSubscriptionPeriod(subscriptionData)) {
      return;
    }

    await this.subscriptionsService.updateByStripeSubscriptionId(
      subscriptionId,
      {
        status: subscriptionData.status,
        stripePriceId: subscriptionData.priceId,
        planInterval: subscriptionData.planInterval,
        currentPeriodStart: new Date(subscriptionData.currentPeriodStart * 1000),
        currentPeriodEnd: new Date(subscriptionData.currentPeriodEnd * 1000),
      },
    );
  }

  private async handleInvoicePaymentFailed(
    invoice: StripeInvoiceExtended,
  ): Promise<void> {
    const subscriptionId = invoice.subscription;
    if (!subscriptionId || typeof subscriptionId !== 'string') {
      return;
    }

    await this.subscriptionsService.updateByStripeSubscriptionId(
      subscriptionId,
      {
        status: 'past_due',
      },
    );
  }

  private async retrieveSubscription(
    subscriptionId: string,
  ): Promise<StripeSubscriptionExtended> {
    const subscription = await this.stripe.subscriptions.retrieve(subscriptionId, {
      expand: ['items.data.price'],
    });

    return subscription as unknown as StripeSubscriptionExtended;
  }

  private extractSubscriptionData(
    subscription: StripeSubscriptionExtended,
  ): ExtractedSubscriptionData {
    const priceId = subscription.items?.data?.[0]?.price?.id;
    const planInterval =
      subscription.items?.data?.[0]?.price?.recurring?.interval;

    return {
      priceId,
      planInterval,
      status: subscription.status,
      currentPeriodStart: subscription.current_period_start,
      currentPeriodEnd: subscription.current_period_end,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
    };
  }

  private validateSubscriptionPeriod(
    data: ExtractedSubscriptionData,
  ): boolean {
    if (!data.currentPeriodStart || !data.currentPeriodEnd) {
      this.logger.error('Invalid subscription period timestamps');
      return false;
    }
    return true;
  }
}
