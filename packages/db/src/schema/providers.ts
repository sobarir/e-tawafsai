import { boolean, integer, pgEnum, pgTable, text, varchar, timestamp } from "drizzle-orm/pg-core";
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
});

export type Provider = typeof providers.$inferSelect;
export type NewProvider = typeof providers.$inferInsert;
