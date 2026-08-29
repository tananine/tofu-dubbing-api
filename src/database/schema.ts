import {
  pgTable,
  serial,
  varchar,
  text,
  timestamp,
  integer,
  boolean,
  date,
  real,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  password: varchar('password', { length: 255 }).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export const subscriptions = pgTable(
  'subscriptions',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id),
    stripeCustomerId: varchar('stripe_customer_id', { length: 255 }),
    stripeSubscriptionId: varchar('stripe_subscription_id', { length: 255 }),
    stripePriceId: varchar('stripe_price_id', { length: 255 }),
    planInterval: varchar('plan_interval', { length: 20 }),
    status: varchar('status', { length: 50 }).notNull().default('active'),
    currentPeriodStart: timestamp('current_period_start').notNull(),
    currentPeriodEnd: timestamp('current_period_end').notNull(),
    cancelAtPeriodEnd: boolean('cancel_at_period_end').default(false),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('subscriptions_stripe_subscription_id_unique').on(
      table.stripeSubscriptionId,
    ),
  ],
);

export type Subscription = typeof subscriptions.$inferSelect;
export type NewSubscription = typeof subscriptions.$inferInsert;

export const usageLogs = pgTable('usage_logs', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id),
  date: date('date').notNull(),
  audioDuration: real('audio_duration').default(0).notNull(),
  audioCount: integer('audio_count').default(0).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export type UsageLog = typeof usageLogs.$inferSelect;
export type NewUsageLog = typeof usageLogs.$inferInsert;

export const dubbingLogs = pgTable('dubbing_logs', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id),
  sourceLanguage: varchar('source_language', { length: 50 }).notNull(),
  targetLanguage: varchar('target_language', { length: 50 }).notNull(),
  pageUrl: text('page_url'),
  isPro: boolean('is_pro').notNull().default(false),
  model: varchar('model', { length: 100 }),
  usedAi: boolean('used_ai').notNull().default(false),
  aiInputTokens: integer('ai_input_tokens').notNull().default(0),
  aiOutputTokens: integer('ai_output_tokens').notNull().default(0),
  aiCachedTokens: integer('ai_cached_tokens').notNull().default(0),
  aiCacheWriteTokens: integer('ai_cache_write_tokens').notNull().default(0),
  audioDuration: real('audio_duration').notNull().default(0),
  completedAt: timestamp('completed_at'),
  errorMessage: text('error_message'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export type DubbingLog = typeof dubbingLogs.$inferSelect;
export type NewDubbingLog = typeof dubbingLogs.$inferInsert;

export const subscriptionClickLogs = pgTable('subscription_click_logs', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id),
  planInterval: varchar('plan_interval', { length: 20 }).notNull(),
  currency: varchar('currency', { length: 10 }).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export type SubscriptionClickLog = typeof subscriptionClickLogs.$inferSelect;
export type NewSubscriptionClickLog =
  typeof subscriptionClickLogs.$inferInsert;

export const subscriptionPageViews = pgTable('subscription_page_views', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id),
  page: varchar('page', { length: 32 }).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export type SubscriptionPageView = typeof subscriptionPageViews.$inferSelect;
export type NewSubscriptionPageView =
  typeof subscriptionPageViews.$inferInsert;

export const loginLogs = pgTable('login_logs', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id),
  country: varchar('country', { length: 10 }),
  ip: varchar('ip', { length: 45 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export type LoginLog = typeof loginLogs.$inferSelect;
export type NewLoginLog = typeof loginLogs.$inferInsert;

export const aiModelUsage = pgTable(
  'ai_model_usage',
  {
    id: serial('id').primaryKey(),
    subscriptionId: integer('subscription_id')
      .references(() => subscriptions.id),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id),
    model: varchar('model', { length: 100 }).notNull(),
    periodStart: timestamp('period_start').notNull(),
    totalDuration: real('total_duration').notNull().default(0),
    inputTokens: integer('input_tokens').notNull().default(0),
    outputTokens: integer('output_tokens').notNull().default(0),
    cachedTokens: integer('cached_tokens').notNull().default(0),
    cacheWriteTokens: integer('cache_write_tokens').notNull().default(0),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('ai_model_usage_user_period_model_unique').on(
      table.userId,
      table.periodStart,
      table.model,
    ),
  ],
);

export type AiModelUsage = typeof aiModelUsage.$inferSelect;
export type NewAiModelUsage = typeof aiModelUsage.$inferInsert;
