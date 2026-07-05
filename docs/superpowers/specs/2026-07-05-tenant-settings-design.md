---
comet_change: tenant-settings
role: technical-design
canonical_spec: openspec
archived-with: 2026-07-05-tenant-settings
status: final
---

# Design Doc: tenant-settings

This design document outlines the implementation plan for storing, validating, and managing tenant-scoped settings in a type-safe and secure manner.

## 1. Schema & Database Design

We will introduce three new tables in `packages/db/src/schema/tenants.ts` to manage settings and message templates.

### `tenant_settings`
Represents the core per-tenant configuration, maintaining a strict 1:1 relationship with the `tenants` table.

```ts
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
```

### `tenant_wa_numbers`
Enables 1:N additional WhatsApp numbers associated with a tenant.

```ts
export const tenantWaNumbers = pgTable("tenant_wa_numbers", {
  id: ulidPk(),
  tenantId: ulidRef("tenant_id")
    .notNull()
    .references(() => tenants.id),
  waNumber: varchar("wa_number", { length: 32 }).notNull(),
  label: varchar("label", { length: 120 }).notNull(),
  ...timestamps,
});
```

### `message_templates`
Represents custom messaging templates with placeholder variables.

```ts
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
```

archived-with: 2026-07-05-tenant-settings
status: final
---

## 2. Contracts & Validation (shared)

### Allowed Variables per Message Template
* `greeting` -> `{customerName}`, `{agentName}`
* `price_quote` -> `{customerName}`, `{packageName}`, `{packagePrice}`
* `dp_reminder` -> `{customerName}`, `{packageName}`, `{dpAmount}`
* `h60_reminder` -> `{customerName}`, `{packageName}`, `{departureDate}`
* `h30_reminder` -> `{customerName}`, `{packageName}`, `{remainingAmount}`, `{dueDate}`
* `doc_checklist` -> `{customerName}`, `{checklistItems}`
* `testimonial_ask` -> `{customerName}`, `{packageName}`

archived-with: 2026-07-05-tenant-settings
status: final
---

## 3. Caching & Operations

### Lazy Upsert
When retrieving a tenant's settings, if the corresponding `tenant_settings` row is missing, the service will lazily upsert the row with the default values.

### In-Process Hot-Key Cache
We will cache the `almostFullThreshold` in-memory with a 60-second TTL to avoid database overhead on hot request paths (e.g. status evaluation during reservations).

archived-with: 2026-07-05-tenant-settings
status: final
---

## 4. Gating & Security

All settings endpoints (read, update, templates) are strictly admin-only. Gating will be enforced on:
* **API Controllers:** using `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles("admin")`.
* **Web UI Routing:** hiding navigation links from non-admin accounts and showing a 403 screen on direct navigation.
