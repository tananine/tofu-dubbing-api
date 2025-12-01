import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { TranslateService } from './translate.service.js';
import { TranslateDto } from './dto/translate.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { ProGuard } from '../auth/guards/pro.guard.js';

@Controller('ai/translate')
export class TranslateController {
  constructor(private translateService: TranslateService) {}

  @UseGuards(JwtAuthGuard, ProGuard)
  @Post()
  async translate(@Body() translateDto: TranslateDto) {
    return this.translateService.translate(translateDto);
  }
}


