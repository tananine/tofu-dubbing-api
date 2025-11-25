import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller.js';
import { LicenseModule } from './license/license.module.js';
import { StripeModule } from './stripe/stripe.module.js';
import { PrismaModule } from './prisma/prisma.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),
    LicenseModule,
    StripeModule,
    PrismaModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
