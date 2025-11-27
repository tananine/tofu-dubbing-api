import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  timestamp,
  json,
  pgEnum,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

export const licenseStatusEnum = pgEnum('LicenseStatus', [
  'ACTIVE',
  'SUSPENDED',
  'EXPIRED',
]);

export const licenses = pgTable(
  'License',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    licenseKey: varchar('licenseKey', { length: 255 }).notNull().unique(),
    email: varchar('email', { length: 255 }).notNull(),
    stripePaymentId: varchar('stripePaymentId', { length: 255 }).unique(),
    stripeCustomerId: varchar('stripeCustomerId', { length: 255 }),
    status: licenseStatusEnum('status').default('ACTIVE').notNull(),
    maxDevices: integer('maxDevices').default(2).notNull(),
    metadata: json('metadata'),
    createdAt: timestamp('createdAt', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updatedAt', { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
    expiresAt: timestamp('expiresAt', { withTimezone: true }),
  },
  (table) => [
    index('license_key_status_idx').on(table.licenseKey, table.status),
    index('license_email_idx').on(table.email),
    index('license_stripe_payment_idx').on(table.stripePaymentId),
  ],
);

export const devices = pgTable(
  'Device',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    licenseId: uuid('licenseId')
      .notNull()
      .references(() => licenses.id, { onDelete: 'cascade' }),
    deviceId: varchar('deviceId', { length: 255 }).notNull(),
    deviceName: varchar('deviceName', { length: 255 }),
    browserInfo: varchar('browserInfo', { length: 255 }),
    ipAddress: varchar('ipAddress', { length: 45 }),
    metadata: json('metadata'),
    lastSeenAt: timestamp('lastSeenAt', { withTimezone: true })
      .defaultNow()
      .notNull(),
    activatedAt: timestamp('activatedAt', { withTimezone: true })
      .defaultNow()
      .notNull(),
    createdAt: timestamp('createdAt', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('device_license_device_idx').on(table.licenseId, table.deviceId),
    index('device_license_idx').on(table.licenseId),
    index('device_device_id_idx').on(table.deviceId),
  ],
);

export const licenseLogs = pgTable(
  'LicenseLog',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    licenseId: uuid('licenseId').references(() => licenses.id, {
      onDelete: 'set null',
    }),
    action: varchar('action', { length: 100 }).notNull(),
    licenseKey: varchar('licenseKey', { length: 255 }),
    stripePaymentId: varchar('stripePaymentId', { length: 255 }),
    deviceId: varchar('deviceId', { length: 255 }),
    ipAddress: varchar('ipAddress', { length: 45 }),
    userAgent: text('userAgent'),
    metadata: json('metadata'),
    createdAt: timestamp('createdAt', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('log_license_idx').on(table.licenseId),
    index('log_action_idx').on(table.action),
    index('log_created_at_idx').on(table.createdAt),
  ],
);

export const licensesRelations = relations(licenses, ({ many }) => ({
  devices: many(devices),
  logs: many(licenseLogs),
}));

export const devicesRelations = relations(devices, ({ one }) => ({
  license: one(licenses, {
    fields: [devices.licenseId],
    references: [licenses.id],
  }),
}));

export const licenseLogsRelations = relations(licenseLogs, ({ one }) => ({
  license: one(licenses, {
    fields: [licenseLogs.licenseId],
    references: [licenses.id],
  }),
}));

export type License = typeof licenses.$inferSelect;
export type NewLicense = typeof licenses.$inferInsert;
export type Device = typeof devices.$inferSelect;
export type NewDevice = typeof devices.$inferInsert;
export type LicenseLog = typeof licenseLogs.$inferSelect;
export type NewLicenseLog = typeof licenseLogs.$inferInsert;
export type LicenseStatus = 'ACTIVE' | 'SUSPENDED' | 'EXPIRED';

