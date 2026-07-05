import { boolean, integer, pgEnum, pgTable, text, varchar, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { ACCREDITATIONS, COMMISSION_TYPES } from "@cometkit/shared";
import { timestamps, ulidPk } from "../columns";
import { tenantOwned } from "./tenants";

export const accreditationEnum = pgEnum("accreditation", ACCREDITATIONS);
export const commissionTypeEnum = pgEnum("commission_type", COMMISSION_TYPES);

export const providers = pgTable("providers", {
  id: ulidPk(),
  ...tenantOwned(),
  name: varchar("name", { length: 255 }).notNull(),
  brandName: varchar("brand_name", { length: 255 }).notNull(),
  ppiuLicenseNo: varchar("ppiu_license_no", { length: 100 }),
  pihkLicenseNo: varchar("pihk_license_no", { length: 100 }),
  accreditation: accreditationEnum("accreditation").notNull().default("unknown"),
  contactPerson: varchar("contact_person", { length: 255 }).notNull(),
  contactPhone: varchar("contact_phone", { length: 32 }).notNull(),
  logoUrl: varchar("logo_url", { length: 2048 }),
  allowLogoOnPublicPages: boolean("allow_logo_on_public_pages").notNull().default(false),
  defaultCommissionType: commissionTypeEnum("default_commission_type").notNull().default("flat_per_pax"),
  defaultCommissionValue: integer("default_commission_value").notNull().default(0),
  commissionNotes: text("commission_notes"),
  isActive: boolean("is_active").notNull().default(false),
  pricePublicationConsentAt: timestamp("price_publication_consent_at"),
  ...timestamps,
}, (t) => [
  // Per-tenant uniqueness on the normalized name and the normalized PPIU.
  // Blank/NULL PPIUs are exempt (partial index), so drafts without a license
  // never collide. Normalization is enforced on write (service + dedup).
  uniqueIndex("providers_tenant_name_unique").on(t.tenantId, sql`lower(btrim(${t.name}))`),
  uniqueIndex("providers_tenant_ppiu_unique")
    .on(t.tenantId, sql`btrim(${t.ppiuLicenseNo})`)
    .where(sql`${t.ppiuLicenseNo} is not null`),
]);

export type Provider = typeof providers.$inferSelect;
export type NewProvider = typeof providers.$inferInsert;
