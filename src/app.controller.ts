import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard.js';
import { AI_MODELS } from './common/ai-models.constants.js';

@Controller()
export class AppController {
  @Get()
  getHealth() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  @Get('ai-models')
  @UseGuards(JwtAuthGuard)
  getAIModels() {
    return { models: AI_MODELS };
  }
}
