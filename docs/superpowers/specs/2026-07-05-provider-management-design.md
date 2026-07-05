---
comet_change: provider-management
role: technical-design
canonical_spec: openspec
archived-with: 2026-07-05-provider-management
status: final
---

# Technical Design: provider-management

This document specifies the technical design for implementing the Licensed Operator (Provider) management capability. It details the database schema, DTO boundaries, local-disk storage uploads, and UI flow components.

archived-with: 2026-07-05-provider-management
status: final
---

## 1. Database Schema

We introduce the `providers` table to capture operator identity, licensing, defaults, and activation parameters.

```ts
import { pgTable, varchar, integer, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { timestamps, ulidPk, ulidRef } from "../columns";

export const providers = pgTable("providers", {
  id: ulidPk(),
  tenantId: ulidRef("tenant_id")
    .notNull()
    .references(() => tenants.id),
  name: varchar("name", { length: 255 }).notNull(),
  brandName: varchar("brand_name", { length: 255 }).notNull(),
  ppiuLicenseNo: varchar("ppiu_license_no", { length: 100 }),
  pihkLicenseNo: varchar("pihk_license_no", { length: 100 }),
  accreditation: varchar("accreditation", { length: 50 }).notNull().default("unknown"),
  contactPerson: varchar("contact_person", { length: 255 }).notNull(),
  contactPhone: varchar("contact_phone", { length: 32 }).notNull(),
  logoUrl: varchar("logo_url", { length: 2048 }),
  allowLogoOnPublicPages: boolean("allow_logo_on_public_pages").notNull().default(false),
  defaultCommissionType: varchar("default_commission_type", { length: 50 }).notNull().default("flat_per_pax"),
  defaultCommissionValue: integer("default_commission_value").notNull().default(0),
  commissionNotes: text("commission_notes"),
  isActive: boolean("is_active").notNull().default(false),
  pricePublicationConsentAt: timestamp("price_publication_consent_at"),
  ...timestamps,
});
```

archived-with: 2026-07-05-provider-management
status: final
---

## 2. API Design & Data Scoping

### 2.1 Role-Based DTO Layouts
To ensure commission defaults are never leaked to staff members, we establish compile-time DTO boundaries:

- **`ProviderDto` (Admins):** Contains all fields including `defaultCommissionType`, `defaultCommissionValue`, and `commissionNotes`.
- **`StaffProviderDto` (Staff):** Excludes the three commission fields above.

### 2.2 Controller Routing
The `ProvidersController` uses `@Roles("admin")` and `@CurrentUser()` decorators to determine access permission and filter output shapes:

```ts
@Controller("providers")
@UseGuards(JwtAuthGuard, RolesGuard)
export class ProvidersController {
  @Get()
  async list(
    @CurrentUser() user: AuthUser,
    @Query() query: ListProvidersQuery
  ): Promise<Paginated<ProviderDto | StaffProviderDto>> {
    // Calls service listing, then applies toProviderDto or toStaffProviderDto mapper
  }
}
```

archived-with: 2026-07-05-provider-management
status: final
---

## 3. Storage Seam & Logo Uploads

To handle file uploads, we introduce an abstract `StorageService` interface, allowing pluggable local/cloud drivers.

### 3.1 Storage Interface & Local Implementation
```ts
export abstract class StorageService {
  abstract uploadFile(file: Buffer, filename: string, mimeType: string, prefix?: string): Promise<string>;
}
```

In development, `LocalStorageService` writes files to `apps/api/public/uploads` and NestJS is configured with `fastify-static` serving to resolve them via local URLs.

archived-with: 2026-07-05-provider-management
status: final
---

## 4. Deactivation Cascade Stub

To avoid circular dependencies between the `providers` and future `package-catalog` module:
- Define `ProviderCascadeService` in the providers module.
- Register a mock implementation returning zero affected packages.
- The future package-catalog module will override this registration and perform the actual SQL unpublish cascades.

archived-with: 2026-07-05-provider-management
status: final
---

## 5. UI Integration

- **Provider Management Panel:** Accessible via `/dashboard/providers`. Contains cards displaying provider state, accreditation badges, and primary contact phone numbers.
- **Role-Aware Forms:** Form details conditionally render or block commission edits based on client session context.
- **Deactivation Dialog:** Prompts the admin with a list of packages that will be unpublished before proceeding.
