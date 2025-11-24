import { Module } from '@nestjs/common';
import { StripeController } from './stripe.controller.js';
import { StripeService } from './stripe.service.js';
import { LicenseModule } from '../license/license.module.js';

@Module({
  imports: [LicenseModule],
  controllers: [StripeController],
  providers: [StripeService],
})
export class StripeModule {}
