import { Module } from '@nestjs/common';
import { StripeWebhookController } from './stripe-webhook.controller.js';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module.js';

@Module({
  imports: [SubscriptionsModule],
  controllers: [StripeWebhookController],
})
export class WebhooksModule {}