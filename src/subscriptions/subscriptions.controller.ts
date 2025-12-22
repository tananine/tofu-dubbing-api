import {
  Controller,
  Post,
  Get,
  Request,
  UseGuards,
  BadRequestException,
  Body,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { SubscriptionsService } from './subscriptions.service.js';
import { MessageCodes } from '../common/message-codes.js';
import { CreateCheckoutDto, PlanInterval } from './dto/create-checkout.dto.js';
import Stripe from 'stripe';

@Controller('subscriptions')
export class SubscriptionsController {
  private stripe: Stripe;
  private portalConfigId: string | null = null;

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
  async createCheckoutSession(
    @Request() req: any,
    @Body() createCheckoutDto: CreateCheckoutDto,
  ) {
    const userId = req.user.id;
    const userEmail = req.user.email;

    const existingSubscription =
      await this.subscriptionsService.findActiveByUserId(userId);
    if (existingSubscription) {
      throw new BadRequestException(MessageCodes.ALREADY_HAVE_SUBSCRIPTION);
    }

    const priceId =
      createCheckoutDto.planInterval === PlanInterval.MONTHLY
        ? this.configService.get<string>('STRIPE_MONTHLY_PRICE_ID')
        : this.configService.get<string>('STRIPE_YEARLY_PRICE_ID');

    const successUrl = this.configService.get<string>('STRIPE_SUCCESS_URL');

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
      metadata: {
        planInterval: createCheckoutDto.planInterval,
      },
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
      throw new BadRequestException(MessageCodes.NO_ACTIVE_SUBSCRIPTION);
    }

    if (!this.portalConfigId) {
      const configuration =
        await this.stripe.billingPortal.configurations.create({
          features: {
            customer_update: {
              allowed_updates: [
                'name',
                'address',
                'phone',
                'shipping',
                'tax_id',
              ],
              enabled: true,
            },
          },
          business_profile: {
            headline: null,
          },
        });
      this.portalConfigId = configuration.id;
    }

    const session = await this.stripe.billingPortal.sessions.create({
      customer: subscription.stripeCustomerId,
      configuration: this.portalConfigId,
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
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
        planInterval: subscription.planInterval,
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
      throw new BadRequestException(MessageCodes.NO_ACTIVE_SUBSCRIPTION);
    }

    if (subscription.cancelAtPeriodEnd) {
      throw new BadRequestException(
        MessageCodes.SUBSCRIPTION_ALREADY_CANCELLED,
      );
    }

    await this.stripe.subscriptions.update(subscription.stripeSubscriptionId, {
      cancel_at_period_end: true,
    });

    await this.subscriptionsService.updateCancelAtPeriodEnd(
      subscription.id,
      true,
    );

    return { message: MessageCodes.SUBSCRIPTION_CANCELLED };
  }

  @Post('reactivate')
  @UseGuards(JwtAuthGuard)
  async reactivateSubscription(@Request() req: any) {
    const userId = req.user.id;
    const subscription =
      await this.subscriptionsService.findCancelableByUserId(userId);

    if (!subscription || !subscription.stripeSubscriptionId) {
      throw new BadRequestException(MessageCodes.NO_CANCELLABLE_SUBSCRIPTION);
    }

    await this.stripe.subscriptions.update(subscription.stripeSubscriptionId, {
      cancel_at_period_end: false,
    });

    await this.subscriptionsService.updateCancelAtPeriodEnd(
      subscription.id,
      false,
    );

    return { message: MessageCodes.SUBSCRIPTION_REACTIVATED };
  }
}
