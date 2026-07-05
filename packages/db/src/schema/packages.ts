import { boolean, integer, pgEnum, pgTable, text, varchar, primaryKey, unique } from "drizzle-orm/pg-core";
import { PRODUCT_TYPES, PACKAGE_CATEGORIES, PACKAGE_STATUSES } from "@cometkit/shared";
import { timestamps, ulidPk, ulidRef } from "../columns";
import { tenantOwned } from "./tenants";
import { providers } from "./providers";

export const productTypeEnum = pgEnum("product_type", PRODUCT_TYPES);
export const categoryEnum = pgEnum("category", PACKAGE_CATEGORIES);
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
  category: categoryEnum("category").notNull().default("regular"),
  plusDestination: varchar("plus_destination", { length: 120 }),
  durationDays: integer("duration_days"),
  description: text("description"),
  airline: varchar("airline", { length: 120 }),
  flightRoute: varchar("flight_route", { length: 255 }),
  departureCity: varchar("departure_city", { length: 120 }),
  isFeatured: boolean("is_featured").notNull().default(false),
  status: statusEnum("status").notNull().default("draft"),
  ...timestamps,
});

export const packageHotels = pgTable("package_hotels", {
  id: ulidPk(),
  packageId: ulidRef("package_id")
    .notNull()
    .references(() => packages.id, { onDelete: "cascade" }),
  cityName: varchar("city_name", { length: 120 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  stars: integer("stars").notNull().default(3),
  distanceM: integer("distance_m"),
  isPelataran: boolean("is_pelataran").notNull().default(false),
  ...timestamps,
});

export const tags = pgTable("tags", {
  id: ulidPk(),
  ...tenantOwned(),
  name: varchar("name", { length: 63 }).notNull(),
  ...timestamps,
}, (table) => [
  unique("tags_tenant_name_idx").on(table.tenantId, table.name),
]);

export const packageTags = pgTable("package_tags", {
  packageId: ulidRef("package_id")
    .notNull()
    .references(() => packages.id, { onDelete: "cascade" }),
  tagId: ulidRef("tag_id")
    .notNull()
    .references(() => tags.id, { onDelete: "cascade" }),
}, (table) => [
  {
    pk: primaryKey({ columns: [table.packageId, table.tagId] }),
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

export type DbTag = typeof tags.$inferSelect;
export type NewDbTag = typeof tags.$inferInsert;

export type DbPackageFlyer = typeof packageFlyers.$inferSelect;
export type NewDbPackageFlyer = typeof packageFlyers.$inferInsert;
