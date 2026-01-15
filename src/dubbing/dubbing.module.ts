import { Module } from '@nestjs/common';
import { DubbingController } from './dubbing.controller.js';
import { DubbingService } from './dubbing.service.js';
import { StorageModule } from '../storage/storage.module.js';
import { TranslationModule } from '../translation/translation.module.js';

@Module({
  imports: [StorageModule, TranslationModule],
  controllers: [DubbingController],
  providers: [DubbingService],
})
export class DubbingModule {}

