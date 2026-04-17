import {
  Controller,
  Post,
  Headers,
  BadRequestException,
  Req,
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
      return;
    }

    if (!subscriptionId) {
      return;
    }

    try {
      const stripeSubscription: any = await this.stripe.subscriptions.retrieve(
        subscriptionId,
        {
          expand: ['items.data.price', 'latest_invoice.lines'],
        },
      );

      const priceId = stripeSubscription.items?.data?.[0]?.price?.id;
      const planInterval = this.mapStripeIntervalToPlanInterval(
        stripeSubscription.items?.data?.[0]?.price?.recurring?.interval,
      );

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
    const subscriptionId = this.extractSubscriptionId(invoice.subscription);
    if (!subscriptionId) {
      return;
    }

    const stripeSubscription = await this.retrieveSubscription(subscriptionId);
    const subscriptionData = this.extractSubscriptionData(stripeSubscription);
    const period =
      this.extractPeriodFromSubscription(subscriptionData) ??
      this.extractPeriodFromInvoice(invoice);

    if (!period) {
      await this.subscriptionsService.updateByStripeSubscriptionId(
        subscriptionId,
        {
          status: subscriptionData.status,
          stripePriceId: subscriptionData.priceId,
          planInterval: subscriptionData.planInterval,
          cancelAtPeriodEnd: subscriptionData.cancelAtPeriodEnd,
        },
      );
      return;
    }

    await this.subscriptionsService.updateByStripeSubscriptionId(
      subscriptionId,
      {
        status: subscriptionData.status,
        stripePriceId: subscriptionData.priceId,
        planInterval: subscriptionData.planInterval,
        currentPeriodStart: period.currentPeriodStart,
        currentPeriodEnd: period.currentPeriodEnd,
        cancelAtPeriodEnd: subscriptionData.cancelAtPeriodEnd,
      },
    );
  }

  private async handleInvoicePaymentFailed(
    invoice: StripeInvoiceExtended,
  ): Promise<void> {
    const subscriptionId = this.extractSubscriptionId(invoice.subscription);
    if (!subscriptionId) {
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
    const planInterval = this.mapStripeIntervalToPlanInterval(
      subscription.items?.data?.[0]?.price?.recurring?.interval,
    );

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
      return false;
    }
    return true;
  }

  private mapStripeIntervalToPlanInterval(
    interval: string | null | undefined,
  ): string | undefined {
    if (!interval) {
      return undefined;
    }

    if (interval === 'month') {
      return 'monthly';
    }

    if (interval === 'year') {
      return 'yearly';
    }

    return interval;
  }

  private extractSubscriptionId(
    subscription: string | Stripe.Subscription | undefined,
  ): string | undefined {
    if (!subscription) {
      return undefined;
    }

    if (typeof subscription === 'string') {
      return subscription;
    }

    return subscription.id;
  }

  private extractPeriodFromSubscription(data: ExtractedSubscriptionData):
    | { currentPeriodStart: Date; currentPeriodEnd: Date }
    | undefined {
    if (!this.validateSubscriptionPeriod(data)) {
      return undefined;
    }

    return {
      currentPeriodStart: new Date(data.currentPeriodStart * 1000),
      currentPeriodEnd: new Date(data.currentPeriodEnd * 1000),
    };
  }

  private extractPeriodFromInvoice(invoice: StripeInvoiceExtended):
    | { currentPeriodStart: Date; currentPeriodEnd: Date }
    | undefined {
    const firstLine = invoice.lines?.data?.[0];
    const linePeriodStart = firstLine?.period?.start;
    const linePeriodEnd = firstLine?.period?.end;

    if (!linePeriodStart || !linePeriodEnd) {
      return undefined;
    }

    return {
      currentPeriodStart: new Date(linePeriodStart * 1000),
      currentPeriodEnd: new Date(linePeriodEnd * 1000),
    };
  }
}
