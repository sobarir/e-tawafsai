import { boolean, pgEnum, pgTable, uniqueIndex, varchar } from "drizzle-orm/pg-core";
import { USER_ROLES } from "@cometkit/shared";
import { timestamps, ulidPk } from "../columns";
import { tenantOwned } from "./tenants";

/** Role enum derives from the shared USER_ROLES tuple - one source of truth. */
export const userRoleEnum = pgEnum("user_role", USER_ROLES);

export const users = pgTable(
  "users",
  {
    id: ulidPk(),
    ...tenantOwned(),
    email: varchar("email", { length: 255 }).notNull(),
    passwordHash: varchar("password_hash", { length: 255 }).notNull(),
    name: varchar("name", { length: 120 }),
    role: userRoleEnum("role").notNull().default("staff"),
    isActive: boolean("is_active").notNull().default(true),
    waNumber: varchar("wa_number", { length: 32 }),
    isPlatformOwner: boolean("is_platform_owner").notNull().default(false),
    ...timestamps,
  },
  (t) => [uniqueIndex("users_tenant_email_unique").on(t.tenantId, t.email)],
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
