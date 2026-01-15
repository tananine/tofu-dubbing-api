import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
} from '@nestjs/common';
import { VoicesService } from './voices.service.js';
import { VoiceListRequestDto } from './dto/voice-list.dto.js';

@Controller('voices')
export class VoicesController {
  constructor(private readonly voicesService: VoicesService) {}

  @Get()
  async getVoices() {
    const voices = await this.voicesService.getEdgeTtsVoices();
    return { voices };
  }

  @Post('list')
  async getVoiceListByType(@Body() body: VoiceListRequestDto) {
    const voiceType = body?.voiceType?.trim().toLowerCase();

    if (!voiceType) {
      throw new BadRequestException('voiceType is required');
    }

    const voices = await this.voicesService.getVoicesByType(voiceType);
    return { voiceType, voices };
  }
}
