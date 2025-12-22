import { Module } from '@nestjs/common';
import { DubbingController } from './dubbing.controller.js';
import { DubbingService } from './dubbing.service.js';
import { StorageModule } from '../storage/storage.module.js';

@Module({
  imports: [StorageModule],
  controllers: [DubbingController],
  providers: [DubbingService],
})
export class DubbingModule {}

