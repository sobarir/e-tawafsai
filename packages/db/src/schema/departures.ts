import { pgTable, text, timestamp, integer, pgEnum, check, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { tenants } from "./tenants";
import { packages } from "./packages";

export const departureTypeEnum = pgEnum("departure_type", ["fixed_date", "estimated_year"]);
export const departureStatusEnum = pgEnum("departure_status", ["open", "almost_full", "full", "departed", "cancelled"]);
export const currencyEnum = pgEnum("currency_type", ["IDR", "USD"]);

export const departures = pgTable("departures", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull().references(() => tenants.id),
  packageId: text("package_id").notNull().references(() => packages.id),
  departureType: departureTypeEnum("departure_type").default("fixed_date").notNull(),
  departureDate: timestamp("departure_date").notNull(),
  returnDate: timestamp("return_date").notNull(),
  seatTotal: integer("seat_total").notNull(),
  seatBooked: integer("seat_booked").default(0).notNull(),
  seatHeld: integer("seat_held").default(0).notNull(),
  currency: currencyEnum("currency").default("IDR").notNull(),
  priceQuad: integer("price_quad").notNull(),
  priceTriple: integer("price_triple"),
  priceDouble: integer("price_double"),
  priceQuadDiscount: integer("price_quad_discount"),
  priceTripleDiscount: integer("price_triple_discount"),
  priceDoubleDiscount: integer("price_double_discount"),
  dpAmount: integer("dp_amount").notNull(),
  paymentSchedule: text("payment_schedule").notNull(), // JSON string representing PaymentMilestone[]
  status: departureStatusEnum("status").default("open").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  seatInvariant: check("seat_invariant", sql`${table.seatTotal} - ${table.seatBooked} - ${table.seatHeld} >= 0`),
  // Serves the package-search correlated lateral (earliest matching departure per
  // package). Leads with package_id so the lateral seeks directly instead of
  // scanning the tenant/status/date index and post-filtering package_id.
  pkgIdx: index("departures_pkg_idx").on(table.packageId, table.status, table.departureDate),
}));

export const inventoryAdjustments = pgTable("inventory_adjustments", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull().references(() => tenants.id),
  departureId: text("departure_id").notNull().references(() => departures.id),
  delta: integer("delta").notNull(),
  reason: text("reason").notNull(),
  actorId: text("actor_id").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type DbDeparture = typeof departures.$inferSelect;
export type DbInventoryAdjustment = typeof inventoryAdjustments.$inferSelect;
