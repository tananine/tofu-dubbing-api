import { Injectable, Inject } from '@nestjs/common';
import { eq, and, sql } from 'drizzle-orm';
import { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { DATABASE_CONNECTION } from '../database/database.module.js';
import * as schema from '../database/schema.js';
import { usageLogs } from '../database/schema.js';

@Injectable()
export class UsageLogsService {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private db: PostgresJsDatabase<typeof schema>,
  ) {}

  async incrementDailyUsage(
    userId: number,
    audioDuration: number,
    audioCount: number = 1,
  ): Promise<void> {
    const today = this.getTodayDateString();

    const existing = await this.db
      .select()
      .from(usageLogs)
      .where(and(eq(usageLogs.userId, userId), eq(usageLogs.date, today)))
      .limit(1);

    if (existing.length > 0) {
      await this.db
        .update(usageLogs)
        .set({
          audioDuration: sql`${usageLogs.audioDuration} + ${audioDuration}`,
          audioCount: sql`${usageLogs.audioCount} + ${audioCount}`,
          updatedAt: new Date(),
        })
        .where(eq(usageLogs.id, existing[0].id));
    } else {
      await this.db.insert(usageLogs).values({
        userId,
        date: today,
        audioDuration,
        audioCount,
      });
    }
  }

  async getTodayUsage(userId: number): Promise<{
    audioDuration: number;
    audioCount: number;
  }> {
    const today = this.getTodayDateString();

    const result = await this.db
      .select()
      .from(usageLogs)
      .where(and(eq(usageLogs.userId, userId), eq(usageLogs.date, today)))
      .limit(1);

    const audioDuration = result[0]?.audioDuration || 0;

    return {
      audioDuration,
      audioCount: result[0]?.audioCount || 0,
    };
  }

  private getTodayDateString(): string {
    const date = new Date();
    return date.toISOString().split('T')[0];
  }
}
