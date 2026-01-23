import { Controller, Get, UseGuards, Request } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { UsageLogsService } from './usage-logs.service.js';

@Controller('usage')
export class UsageController {
  constructor(private readonly usageLogsService: UsageLogsService) {}

  @Get('today')
  @UseGuards(JwtAuthGuard)
  async getTodayUsage(@Request() req: any) {
    return this.usageLogsService.getTodayUsage(req.user.id);
  }
}
