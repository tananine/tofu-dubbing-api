import { Module } from '@nestjs/common';
import { UsersService } from './users.service.js';
import { UsageLogsService } from './usage-logs.service.js';
import { UsageController } from './usage.controller.js';

@Module({
  controllers: [UsageController],
  providers: [UsersService, UsageLogsService],
  exports: [UsersService, UsageLogsService],
})
export class UsersModule {}