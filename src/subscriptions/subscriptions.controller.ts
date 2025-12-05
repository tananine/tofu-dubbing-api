import {
  Controller,
  Post,
  Get,
  Request,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { SubscriptionsService } from './subscriptions.service.js';
import Stripe from 'stripe';

@Controller('subscriptions')
export class SubscriptionsController {
  private stripe: Stripe;

  constructor(
    private subscriptionsService: SubscriptionsService,
    private configService: ConfigService,
  ) {
    this.stripe = new Stripe(
      this.configService.get<string>('STRIPE_SECRET_KEY')!,
    );
  }

  @Post('create-checkout-session')
  @UseGuards(JwtAuthGuard)
  async createCheckoutSession(@Request() req: any) {
    const userId = req.user.id;
    const userEmail = req.user.email;

    const existingSubscription =
      await this.subscriptionsService.findActiveByUserId(userId);
    if (existingSubscription) {
      throw new BadRequestException('You already have an active subscription');
    }

    const priceId = this.configService.get<string>('STRIPE_PRICE_ID');
    const successUrl =
      this.configService.get<string>('STRIPE_SUCCESS_URL') ||
      'http://localhost:3000/success';
    const cancelUrl =
      this.configService.get<string>('STRIPE_CANCEL_URL') ||
      'http://localhost:3000/pricing';

    const session = await this.stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      client_reference_id: String(userId),
      customer_email: userEmail,
      success_url: `${successUrl}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancelUrl,
    });

    return { url: session.url };
  }

  @Post('customer-portal')
  @UseGuards(JwtAuthGuard)
  async createPortalSession(@Request() req: any) {
    const userId = req.user.id;
    const subscription =
      await this.subscriptionsService.findActiveByUserId(userId);

    if (!subscription || !subscription.stripeCustomerId) {
      throw new BadRequestException('No active subscription found');
    }

    const returnUrl =
      this.configService.get<string>('STRIPE_PORTAL_RETURN_URL') ||
      'http://localhost:3000/settings';

    const session = await this.stripe.billingPortal.sessions.create({
      customer: subscription.stripeCustomerId,
      return_url: returnUrl,
    });

    return { url: session.url };
  }

  @Get('status')
  @UseGuards(JwtAuthGuard)
  async getSubscriptionStatus(@Request() req: any) {
    const userId = req.user.id;
    const subscription =
      await this.subscriptionsService.findUsableByUserId(userId);

    if (!subscription) {
      return {
        isPro: false,
        subscription: null,
      };
    }

    return {
      isPro: true,
      subscription: {
        status: subscription.status,
        currentPeriodEnd: subscription.currentPeriodEnd,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd === 1,
      },
    };
  }

  @Post('cancel')
  @UseGuards(JwtAuthGuard)
  async cancelSubscription(@Request() req: any) {
    const userId = req.user.id;
    const subscription =
      await this.subscriptionsService.findActiveByUserId(userId);

    if (!subscription || !subscription.stripeSubscriptionId) {
      throw new BadRequestException('No active subscription found');
    }

    if (subscription.cancelAtPeriodEnd === 1) {
      throw new BadRequestException('Subscription is already set to cancel');
    }

    await this.stripe.subscriptions.update(subscription.stripeSubscriptionId, {
      cancel_at_period_end: true,
    });

    await this.subscriptionsService.updateCancelAtPeriodEnd(
      subscription.id,
      true,
    );

    return { message: 'Subscription will be canceled at period end' };
  }

  @Post('reactivate')
  @UseGuards(JwtAuthGuard)
  async reactivateSubscription(@Request() req: any) {
    const userId = req.user.id;
    const subscription =
      await this.subscriptionsService.findCancelableByUserId(userId);

    if (!subscription || !subscription.stripeSubscriptionId) {
      throw new BadRequestException(
        'No subscription pending cancellation found',
      );
    }

    await this.stripe.subscriptions.update(subscription.stripeSubscriptionId, {
      cancel_at_period_end: false,
    });

    await this.subscriptionsService.updateCancelAtPeriodEnd(
      subscription.id,
      false,
    );

    return { message: 'Subscription reactivated successfully' };
  }
}
