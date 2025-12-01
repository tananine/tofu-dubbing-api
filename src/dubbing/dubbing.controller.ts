import { Controller, Post, Body, UseGuards, Request } from '@nestjs/common';
import { DubbingService } from './dubbing.service.js';
import { StartDubbingDto } from './dto/start-dubbing.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';

@Controller('dubbing')
export class DubbingController {
  constructor(private dubbingService: DubbingService) {}

  @UseGuards(JwtAuthGuard)
  @Post('start')
  async startDubbing(
    @Request() req: any,
    @Body() startDubbingDto: StartDubbingDto,
  ) {
    const policyToken = await this.dubbingService.generatePolicyToken(
      req.user.id,
      startDubbingDto,
    );

    return { policyToken };
  }
}

