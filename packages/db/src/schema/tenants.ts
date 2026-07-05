import { pgEnum, pgTable, varchar, integer, text, unique } from "drizzle-orm/pg-core";
import {
  TENANT_PLAN_STATUSES,
  TENANT_PLANS,
  TENANT_TYPES,
} from "@cometkit/shared";
import { timestamps, ulidPk, ulidRef } from "../columns";

export const tenantTypeEnum = pgEnum("tenant_type", TENANT_TYPES);
export const tenantPlanEnum = pgEnum("tenant_plan", TENANT_PLANS);
export const tenantPlanStatusEnum = pgEnum("tenant_plan_status", TENANT_PLAN_STATUSES);

export const tenants = pgTable("tenants", {
  id: ulidPk(),
  name: varchar("name", { length: 120 }).notNull(),
  slug: varchar("slug", { length: 63 }).notNull().unique(),
  tenantType: tenantTypeEnum("tenant_type").notNull().default("agent"),
  plan: tenantPlanEnum("plan").notNull().default("subscription"),
  planStatus: tenantPlanStatusEnum("plan_status").notNull().default("active"),
  brandName: varchar("brand_name", { length: 120 }).notNull(),
  brandLogoUrl: varchar("brand_logo_url", { length: 2048 }),
  waNumber: varchar("wa_number", { length: 32 }),
  customDomain: varchar("custom_domain", { length: 255 }),
  ...timestamps,
});

export const tenantSettings = pgTable("tenant_settings", {
  id: ulidPk(),
  tenantId: ulidRef("tenant_id")
    .notNull()
    .unique()
    .references(() => tenants.id),
  metaPixelId: varchar("meta_pixel_id", { length: 255 }),
  googleTagId: varchar("google_tag_id", { length: 255 }),
  almostFullThreshold: integer("almost_full_threshold").notNull().default(5),
  holdExpiryHours: integer("hold_expiry_hours").notNull().default(48),
  followUpLeadDays: integer("follow_up_lead_days").notNull().default(2),
  followUpQuoteDays: integer("follow_up_quote_days").notNull().default(3),
  followUpDpReminderDays: integer("follow_up_dp_reminder_days").notNull().default(7),
  followUpFullPaymentDays: integer("follow_up_full_payment_days").notNull().default(14),
  ...timestamps,
});

export const tenantWaNumbers = pgTable("tenant_wa_numbers", {
  id: ulidPk(),
  tenantId: ulidRef("tenant_id")
    .notNull()
    .references(() => tenants.id),
  waNumber: varchar("wa_number", { length: 32 }).notNull(),
  label: varchar("label", { length: 120 }).notNull(),
  ...timestamps,
});

export const messageTemplates = pgTable("message_templates", {
  id: ulidPk(),
  tenantId: ulidRef("tenant_id")
    .notNull()
    .references(() => tenants.id),
  key: varchar("key", { length: 63 }).notNull(),
  label: varchar("label", { length: 120 }).notNull(),
  body: text("body").notNull(),
  ...timestamps,
}, (table) => [
  unique("message_templates_tenant_key_idx").on(table.tenantId, table.key),
]);

export type Tenant = typeof tenants.$inferSelect;
export type NewTenant = typeof tenants.$inferInsert;

export type TenantSettings = typeof tenantSettings.$inferSelect;
export type NewTenantSettings = typeof tenantSettings.$inferInsert;

export type TenantWaNumber = typeof tenantWaNumbers.$inferSelect;
export type NewTenantWaNumber = typeof tenantWaNumbers.$inferInsert;

export type MessageTemplate = typeof messageTemplates.$inferSelect;
export type NewMessageTemplate = typeof messageTemplates.$inferInsert;

/**
 * Column group every tenant-owned table spreads. Lives in the schema layer
 * (not columns.ts) because it references the tenants table — keeping it in
 * columns.ts would create a columns.ts <-> tenants import cycle.
 */
export const tenantOwned = () => ({
  tenantId: ulidRef("tenant_id")
    .notNull()
    .references(() => tenants.id),
});

