import { Module } from '@nestjs/common';
import { TranslateController } from './translate.controller.js';
import { TranslateService } from './translate.service.js';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module.js';
import { ProGuard } from '../auth/guards/pro.guard.js';

@Module({
  imports: [SubscriptionsModule],
  controllers: [TranslateController],
  providers: [TranslateService, ProGuard],
})
export class TranslateModule {}
