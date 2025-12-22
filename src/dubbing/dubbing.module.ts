import { Module } from '@nestjs/common';
import { DubbingController } from './dubbing.controller.js';
import { DubbingService } from './dubbing.service.js';

@Module({
  controllers: [DubbingController],
  providers: [DubbingService],
})
export class DubbingModule {}

