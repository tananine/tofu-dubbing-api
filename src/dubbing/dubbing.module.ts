import { Module } from '@nestjs/common';
import { DubbingController } from './dubbing.controller.js';
import { DubbingService } from './dubbing.service.js';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module.js';

@Module({
  imports: [SubscriptionsModule],
  controllers: [DubbingController],
  providers: [DubbingService],
  exports: [DubbingService],
})
export class DubbingModule {}

