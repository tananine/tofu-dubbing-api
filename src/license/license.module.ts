import { Module } from '@nestjs/common';
import { LicenseController } from './license.controller.js';
import { LicenseService } from './license.service.js';
import { PrismaModule } from '../prisma/prisma.module.js';

@Module({
  imports: [PrismaModule],
  controllers: [LicenseController],
  providers: [LicenseService],
  exports: [LicenseService],
})
export class LicenseModule {}
