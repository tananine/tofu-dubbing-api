import { Module } from '@nestjs/common';
import { VoicesController } from './voices.controller.js';
import { VoicesService } from './voices.service.js';

@Module({
  controllers: [VoicesController],
  providers: [VoicesService],
})
export class VoicesModule {}
