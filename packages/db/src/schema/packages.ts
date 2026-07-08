import { boolean, integer, pgEnum, pgTable, text, varchar, primaryKey, unique, index, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { PRODUCT_TYPES, PACKAGE_STATUSES } from "@cometkit/shared";
import { timestamps, ulidPk, ulidRef } from "../columns";
import { tenantOwned } from "./tenants";
import { providers, commissionTypeEnum } from "./providers";

export const productTypeEnum = pgEnum("product_type", PRODUCT_TYPES);
export const statusEnum = pgEnum("status", PACKAGE_STATUSES);

export const packages = pgTable("packages", {
  id: ulidPk(),
  ...tenantOwned(),
  providerId: ulidRef("provider_id")
    .notNull()
    .references(() => providers.id),
  productType: productTypeEnum("product_type").notNull().default("umrah"),
  title: varchar("title", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 255 }).notNull(),
  categoryId: ulidRef("category_id").references(() => packageCategories.id),
  plusDestination: varchar("plus_destination", { length: 120 }),
  durationDays: integer("duration_days"),
  description: text("description"),
  airlineId: ulidRef("airline_id").references(() => airlines.id),
  flightRoute: varchar("flight_route", { length: 255 }),
  departureCityId: ulidRef("departure_city_id").references(() => departureCities.id),
  isFeatured: boolean("is_featured").notNull().default(false),
  directOnly: boolean("direct_only").notNull().default(false),
  hasBeenPublished: boolean("has_been_published").notNull().default(false),
  status: statusEnum("status").notNull().default("draft"),
  ...timestamps,
}, (table) => [
  unique("packages_tenant_slug_idx").on(table.tenantId, table.slug),
]);

export const packageCategories = pgTable("package_categories", {
  id: ulidPk(),
  ...tenantOwned(),
  providerId: ulidRef("provider_id")
    .notNull()
    .references(() => providers.id),
  productType: productTypeEnum("product_type").notNull().default("umrah"),
  name: varchar("name", { length: 120 }).notNull(),
  commissionType: commissionTypeEnum("commission_type").notNull().default("flat_per_pax"),
  commissionValue: integer("commission_value").notNull().default(0),
  ...timestamps,
}, (table) => [
  // Per-(tenant, provider, productType) uniqueness on the normalized name,
  // mirroring the providers normalized-name idiom.
  uniqueIndex("package_categories_scope_name_idx")
    .on(table.tenantId, table.providerId, table.productType, sql`lower(btrim(${table.name}))`),
  index("package_categories_provider_idx").on(table.providerId),
]);

export type DbPackageCategory = typeof packageCategories.$inferSelect;
export type NewDbPackageCategory = typeof packageCategories.$inferInsert;

export const airlines = pgTable("airlines", {
  id: ulidPk(),
  ...tenantOwned(),
  name: varchar("name", { length: 120 }).notNull(),
  isActive: boolean("is_active").notNull().default(true),
  ...timestamps,
}, (t) => [
  uniqueIndex("airlines_tenant_name_idx").on(t.tenantId, sql`lower(btrim(${t.name}))`),
]);

export const departureCities = pgTable("departure_cities", {
  id: ulidPk(),
  ...tenantOwned(),
  name: varchar("name", { length: 120 }).notNull(),
  isActive: boolean("is_active").notNull().default(true),
  ...timestamps,
}, (t) => [
  uniqueIndex("departure_cities_tenant_name_idx").on(t.tenantId, sql`lower(btrim(${t.name}))`),
]);

export type DbAirline = typeof airlines.$inferSelect;
export type NewDbAirline = typeof airlines.$inferInsert;
export type DbDepartureCity = typeof departureCities.$inferSelect;
export type NewDbDepartureCity = typeof departureCities.$inferInsert;

// Tenant-global hotel catalog. Unlike the airline/city masters, a hotel
// carries attributes (city, stars, distance-to-Haram, pelataran). City is
// free text so Makkah, Madinah, and transit/plus cities are all expressible;
// uniqueness is on the normalized name+city pair so one name may exist in two
// cities.
export const hotels = pgTable("hotels", {
  id: ulidPk(),
  ...tenantOwned(),
  name: varchar("name", { length: 120 }).notNull(),
  city: varchar("city", { length: 120 }).notNull(),
  stars: integer("stars").notNull().default(3),
  distanceM: integer("distance_m"),
  isPelataran: boolean("is_pelataran").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  ...timestamps,
}, (t) => [
  uniqueIndex("hotels_tenant_name_city_idx")
    .on(t.tenantId, sql`lower(btrim(${t.name}))`, sql`lower(btrim(${t.city}))`),
]);

export type DbHotel = typeof hotels.$inferSelect;
export type NewDbHotel = typeof hotels.$inferInsert;

// A pure link between a package and a catalog hotel. All hotel attributes
// live on `hotels`; this table only records which hotels a package uses.
export const packageHotels = pgTable("package_hotels", {
  id: ulidPk(),
  packageId: ulidRef("package_id")
    .notNull()
    .references(() => packages.id, { onDelete: "cascade" }),
  hotelId: ulidRef("hotel_id")
    .notNull()
    .references(() => hotels.id),
  ...timestamps,
}, (table) => [
  // Both FK columns are queried (search laterals correlate on package_id;
  // delete-guard counts on hotel_id). Postgres does not auto-index FK columns.
  index("package_hotels_package_id_idx").on(table.packageId),
  index("package_hotels_hotel_id_idx").on(table.hotelId),
  // A package must not attach the same hotel twice.
  unique("package_hotels_package_hotel_idx").on(table.packageId, table.hotelId),
]);

export const inclusions = pgTable("inclusions", {
  id: ulidPk(),
  ...tenantOwned(),
  name: varchar("name", { length: 120 }).notNull(),
  isActive: boolean("is_active").notNull().default(true),
  ...timestamps,
}, (t) => [
  uniqueIndex("inclusions_tenant_name_idx").on(t.tenantId, sql`lower(btrim(${t.name}))`),
]);

export const exclusions = pgTable("exclusions", {
  id: ulidPk(),
  ...tenantOwned(),
  name: varchar("name", { length: 120 }).notNull(),
  isActive: boolean("is_active").notNull().default(true),
  ...timestamps,
}, (t) => [
  uniqueIndex("exclusions_tenant_name_idx").on(t.tenantId, sql`lower(btrim(${t.name}))`),
]);

export const packageInclusions = pgTable("package_inclusions", {
  packageId: ulidRef("package_id")
    .notNull()
    .references(() => packages.id, { onDelete: "cascade" }),
  inclusionId: ulidRef("inclusion_id")
    .notNull()
    .references(() => inclusions.id, { onDelete: "cascade" }),
}, (table) => [
  {
    pk: primaryKey({ columns: [table.packageId, table.inclusionId] }),
  }
]);

export const packageExclusions = pgTable("package_exclusions", {
  packageId: ulidRef("package_id")
    .notNull()
    .references(() => packages.id, { onDelete: "cascade" }),
  exclusionId: ulidRef("exclusion_id")
    .notNull()
    .references(() => exclusions.id, { onDelete: "cascade" }),
}, (table) => [
  {
    pk: primaryKey({ columns: [table.packageId, table.exclusionId] }),
  }
]);

export const packageFlyers = pgTable("package_flyers", {
  id: ulidPk(),
  packageId: ulidRef("package_id")
    .notNull()
    .references(() => packages.id, { onDelete: "cascade" }),
  url: varchar("url", { length: 2048 }).notNull(),
  ...timestamps,
});

export type DbPackage = typeof packages.$inferSelect;
export type NewDbPackage = typeof packages.$inferInsert;

export type DbPackageHotel = typeof packageHotels.$inferSelect;
export type NewDbPackageHotel = typeof packageHotels.$inferInsert;

export type DbInclusion = typeof inclusions.$inferSelect;
export type NewDbInclusion = typeof inclusions.$inferInsert;
export type DbExclusion = typeof exclusions.$inferSelect;
export type NewDbExclusion = typeof exclusions.$inferInsert;

export type DbPackageFlyer = typeof packageFlyers.$inferSelect;
export type NewDbPackageFlyer = typeof packageFlyers.$inferInsert;
