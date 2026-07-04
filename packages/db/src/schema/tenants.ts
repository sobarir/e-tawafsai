import { pgEnum, pgTable, varchar } from "drizzle-orm/pg-core";
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

export type Tenant = typeof tenants.$inferSelect;
export type NewTenant = typeof tenants.$inferInsert;

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
