import { Controller, Post, Body, UseGuards, Request } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { DubbingService } from './dubbing.service.js';
import { GenerateDubbingDto } from './dto/generate-dubbing.dto.js';
import { StartDubbingDto } from './dto/start-dubbing.dto.js';
import { FetchSubtitlesDto } from './dto/fetch-subtitles.dto.js';

@Controller('dubbing')
export class DubbingController {
  constructor(private readonly dubbingService: DubbingService) {}

  @Post('start')
  @UseGuards(JwtAuthGuard)
  async startDubbing(
    @Body() startDubbingDto: StartDubbingDto,
    @Request() req: any,
  ) {
    return this.dubbingService.startSession(startDubbingDto, req.user.id);
  }

  @Post('generate')
  @UseGuards(JwtAuthGuard)
  async generateDubbing(
    @Body() generateDubbingDto: GenerateDubbingDto,
    @Request() req: any,
  ) {
    return this.dubbingService.generateDubbing(generateDubbingDto, req.user.id);
  }

  @Post('subtitles/fetch')
  @UseGuards(JwtAuthGuard)
  async fetchSubtitles(
    @Body() fetchSubtitlesDto: FetchSubtitlesDto,
    @Request() req: any,
  ) {
    return this.dubbingService.fetchSubtitlesViaYtDlp(
      fetchSubtitlesDto.dubbingLogId,
      fetchSubtitlesDto.videoId,
      fetchSubtitlesDto.language,
      req.user.id,
    );
  }
}
