import { Injectable, Inject } from '@nestjs/common';
import { eq, and, gte, desc, inArray } from 'drizzle-orm';
import { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { DATABASE_CONNECTION } from '../database/database.module.js';
import * as schema from '../database/schema.js';
import {
  subscriptions,
  NewSubscription,
  subscriptionClickLogs,
  subscriptionPageViews,
} from '../database/schema.js';

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
          inArray(subscriptions.status, ['active', 'trialing']),
        ),
      )
      .orderBy(desc(subscriptions.currentPeriodEnd))
      .limit(1);
    return result[0];
  }

  async findUsableByUserId(userId: number) {
    return this.findActiveByUserId(userId);
  }

  async findByUserId(userId: number) {
    const result = await this.db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.userId, userId))
      .orderBy(desc(subscriptions.createdAt))
      .limit(1);
    return result[0];
  }

  async findByStripeSubscriptionId(stripeSubscriptionId: string) {
    const result = await this.db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.stripeSubscriptionId, stripeSubscriptionId))
      .limit(1);
    return result[0];
  }

  async isPro(userId: number): Promise<boolean> {
    // const subscription = await this.findUsableByUserId(userId);
    // return !!subscription;
    return true;
  }

  async findCancelableByUserId(userId: number) {
    const result = await this.db
      .select()
      .from(subscriptions)
      .where(
        and(
          eq(subscriptions.userId, userId),
          gte(subscriptions.currentPeriodEnd, new Date()),
          inArray(subscriptions.status, ['active', 'trialing']),
          eq(subscriptions.cancelAtPeriodEnd, true),
        ),
      )
      .orderBy(desc(subscriptions.currentPeriodEnd))
      .limit(1);
    return result[0];
  }

  async createOrUpdate(data: {
    userId: number;
    stripeCustomerId: string;
    stripeSubscriptionId: string;
    stripePriceId?: string;
    planInterval?: string;
    status: string;
    currentPeriodStart: Date;
    currentPeriodEnd: Date;
    cancelAtPeriodEnd?: boolean;
  }) {
    const existing = await this.findByStripeSubscriptionId(
      data.stripeSubscriptionId,
    );

    if (existing) {
      await this.db
        .update(subscriptions)
        .set({
          stripeCustomerId: data.stripeCustomerId,
          stripeSubscriptionId: data.stripeSubscriptionId,
          stripePriceId: data.stripePriceId,
          planInterval: data.planInterval,
          status: data.status,
          currentPeriodStart: data.currentPeriodStart,
          currentPeriodEnd: data.currentPeriodEnd,
          cancelAtPeriodEnd: data.cancelAtPeriodEnd ?? false,
          updatedAt: new Date(),
        })
        .where(eq(subscriptions.id, existing.id));
      return { ...existing, ...data };
    }

    const newSubscription: NewSubscription = {
      userId: data.userId,
      stripeCustomerId: data.stripeCustomerId,
      stripeSubscriptionId: data.stripeSubscriptionId,
      stripePriceId: data.stripePriceId,
      planInterval: data.planInterval,
      status: data.status,
      currentPeriodStart: data.currentPeriodStart,
      currentPeriodEnd: data.currentPeriodEnd,
      cancelAtPeriodEnd: data.cancelAtPeriodEnd ?? false,
    };

    const result = await this.db
      .insert(subscriptions)
      .values(newSubscription)
      .returning();

    return result[0];
  }

  async updateByStripeSubscriptionId(
    stripeSubscriptionId: string,
    data: Partial<{
      status: string;
      stripePriceId: string;
      planInterval: string;
      currentPeriodStart: Date;
      currentPeriodEnd: Date;
      cancelAtPeriodEnd: boolean;
    }>,
  ) {
    const result = await this.db
      .update(subscriptions)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(subscriptions.stripeSubscriptionId, stripeSubscriptionId))
      .returning({ id: subscriptions.id });

    if (result.length === 0) {
      throw new Error(
        `Subscription not found for stripeSubscriptionId=${stripeSubscriptionId}`,
      );
    }
  }

  async updateCancelAtPeriodEnd(subscriptionId: number, cancel: boolean) {
    await this.db
      .update(subscriptions)
      .set({
        cancelAtPeriodEnd: cancel,
        updatedAt: new Date(),
      })
      .where(eq(subscriptions.id, subscriptionId));
  }

  async logSubscriptionClick(
    userId: number,
    planInterval: string,
    currency: string,
  ) {
    await this.db.insert(subscriptionClickLogs).values({
      userId,
      planInterval,
      currency,
    });
  }

  async logPageView(userId: number, page: string) {
    await this.db.insert(subscriptionPageViews).values({
      userId,
      page,
    });
  }
}
