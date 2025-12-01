import { Module } from '@nestjs/common';
import { TranslateController } from './translate.controller.js';
import { TranslateService } from './translate.service.js';

@Module({
  controllers: [TranslateController],
  providers: [TranslateService],
})
export class TranslateModule {}

