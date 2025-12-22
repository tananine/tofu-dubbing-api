import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller.js';
import { DatabaseModule } from './database/database.module.js';
import { AuthModule } from './auth/auth.module.js';
import { UsersModule } from './users/users.module.js';
import { SubscriptionsModule } from './subscriptions/subscriptions.module.js';
import { WebhooksModule } from './webhooks/webhooks.module.js';
import { DubbingModule } from './dubbing/dubbing.module.js';
import { StorageModule } from './storage/storage.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    AuthModule,
    UsersModule,
    SubscriptionsModule,
    WebhooksModule,
    StorageModule,
    DubbingModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
