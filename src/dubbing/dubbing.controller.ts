import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { DubbingService } from './dubbing.service.js';
import { GenerateDubbingDto } from './dto/generate-dubbing.dto.js';

@Controller('dubbing')
export class DubbingController {
  constructor(private readonly dubbingService: DubbingService) {}

  @Post('generate')
  @UseGuards(JwtAuthGuard)
  async generateDubbing(@Body() generateDubbingDto: GenerateDubbingDto) {
    return this.dubbingService.generateDubbing(generateDubbingDto);
  }
}

