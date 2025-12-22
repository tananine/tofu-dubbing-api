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
    } catch {
      throw new BadRequestException(MessageCodes.INVALID_SIGNATURE);
    }

    switch (event.type) {
      case 'checkout.session.completed':
        await this.handleCheckoutSessionCompleted(
          event.data.object as Stripe.Checkout.Session,
        );
        break;

      case 'customer.subscription.updated':
        await this.handleSubscriptionUpdated(event.data.object);
        break;

      case 'customer.subscription.deleted':
        await this.handleSubscriptionDeleted(event.data.object);
        break;

      case 'invoice.payment_succeeded':
        await this.handleInvoicePaymentSucceeded(event.data.object);
        break;

      case 'invoice.payment_failed':
        await this.handleInvoicePaymentFailed(event.data.object);
        break;
    }

    return { received: true };
  }

  private async handleCheckoutSessionCompleted(
    session: Stripe.Checkout.Session,
  ) {
    const userId = session.client_reference_id;
    const customerId = session.customer as string;
    const subscriptionId = session.subscription as string;

    if (!userId) {
      return;
    }

    const stripeSubscription = (await this.stripe.subscriptions.retrieve(
      subscriptionId,
    )) as any;

    const priceId = stripeSubscription.items?.data?.[0]?.price?.id;
    const planInterval =
      stripeSubscription.items?.data?.[0]?.price?.recurring?.interval;

    await this.subscriptionsService.createOrUpdate({
      userId: parseInt(userId, 10),
      stripeCustomerId: customerId,
      stripeSubscriptionId: subscriptionId,
      stripePriceId: priceId,
      planInterval: planInterval,
      status: stripeSubscription.status,
      currentPeriodStart: new Date(
        stripeSubscription.current_period_start * 1000,
      ),
      currentPeriodEnd: new Date(stripeSubscription.current_period_end * 1000),
      cancelAtPeriodEnd: stripeSubscription.cancel_at_period_end,
    });
  }

  private async handleSubscriptionUpdated(eventData: any) {
    const stripeSubscription = eventData as {
      id: string;
      status: string;
      current_period_start: number;
      current_period_end: number;
      cancel_at_period_end: boolean;
      items?: {
        data?: Array<{
          price?: {
            id?: string;
            recurring?: { interval?: string };
          };
        }>;
      };
    };

    const priceId = stripeSubscription.items?.data?.[0]?.price?.id;
    const planInterval =
      stripeSubscription.items?.data?.[0]?.price?.recurring?.interval;

    await this.subscriptionsService.updateByStripeSubscriptionId(
      stripeSubscription.id,
      {
        status: stripeSubscription.status,
        stripePriceId: priceId,
        planInterval: planInterval,
        currentPeriodStart: new Date(
          stripeSubscription.current_period_start * 1000,
        ),
        currentPeriodEnd: new Date(
          stripeSubscription.current_period_end * 1000,
        ),
        cancelAtPeriodEnd: stripeSubscription.cancel_at_period_end,
      },
    );
  }

  private async handleSubscriptionDeleted(eventData: any) {
    const stripeSubscription = eventData as { id: string };

    await this.subscriptionsService.updateByStripeSubscriptionId(
      stripeSubscription.id,
      {
        status: 'canceled',
      },
    );
  }

  private async handleInvoicePaymentSucceeded(eventData: any) {
    const invoice = eventData as { subscription?: string };
    const subscriptionId = invoice.subscription;
    if (!subscriptionId) return;

    const stripeSubscription = (await this.stripe.subscriptions.retrieve(
      subscriptionId,
    )) as any;

    const priceId = stripeSubscription.items?.data?.[0]?.price?.id;
    const planInterval =
      stripeSubscription.items?.data?.[0]?.price?.recurring?.interval;

    await this.subscriptionsService.updateByStripeSubscriptionId(
      subscriptionId,
      {
        status: stripeSubscription.status,
        stripePriceId: priceId,
        planInterval: planInterval,
        currentPeriodStart: new Date(
          stripeSubscription.current_period_start * 1000,
        ),
        currentPeriodEnd: new Date(
          stripeSubscription.current_period_end * 1000,
        ),
      },
    );
  }

  private async handleInvoicePaymentFailed(eventData: any) {
    const invoice = eventData as { subscription?: string };
    const subscriptionId = invoice.subscription;
    if (!subscriptionId) return;

    await this.subscriptionsService.updateByStripeSubscriptionId(
      subscriptionId,
      {
        status: 'past_due',
      },
    );
  }
}
