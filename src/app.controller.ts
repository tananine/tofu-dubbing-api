import { Controller, Get } from '@nestjs/common';
import { AI_MODELS } from './common/ai-models.constants.js';

@Controller()
export class AppController {
  @Get()
  getHealth() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  @Get('ai-models')
  getAIModels() {
    return { models: AI_MODELS };
  }
}
