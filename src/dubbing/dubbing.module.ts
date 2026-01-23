import { Module } from '@nestjs/common';
import { DubbingController } from './dubbing.controller.js';
import { DubbingService } from './dubbing.service.js';
import { StorageModule } from '../storage/storage.module.js';
import { TranslationModule } from '../translation/translation.module.js';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module.js';

@Module({
  controllers: [DubbingController],
  imports: [StorageModule, TranslationModule, SubscriptionsModule],
  providers: [DubbingService],
})
export class DubbingModule {}