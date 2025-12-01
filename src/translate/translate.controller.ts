import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { TranslateService } from './translate.service.js';
import { TranslateDto } from './dto/translate.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';

@Controller('translate')
export class TranslateController {
  constructor(private translateService: TranslateService) {}

  @UseGuards(JwtAuthGuard)
  @Post()
  async translate(@Body() translateDto: TranslateDto) {
    return this.translateService.translate(translateDto);
  }
}

