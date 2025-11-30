import { Injectable, Inject } from '@nestjs/common';
import { eq, and, gte } from 'drizzle-orm';
import { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { DATABASE_CONNECTION } from '../database/database.module.js';
import * as schema from '../database/schema.js';
import { subscriptions } from '../database/schema.js';

@Injectable()
export class SubscriptionsService {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private db: PostgresJsDatabase<typeof schema>,
  ) {}

  async findActiveByUserId(userId: number) {
    const result = await this.db
      .select()
      .from(subscriptions)
      .where(
        and(
          eq(subscriptions.userId, userId),
          gte(subscriptions.currentPeriodEnd, new Date()),
        ),
      )
      .limit(1);
    return result[0];
  }

  async isPro(userId: number): Promise<boolean> {
    const subscription = await this.findActiveByUserId(userId);
    return !!subscription;
  }
}
