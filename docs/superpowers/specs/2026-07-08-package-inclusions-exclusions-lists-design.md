---
comet_change: package-inclusions-exclusions-lists
role: technical-design
canonical_spec: openspec
archived-with: 2026-07-08-package-inclusions-exclusions-lists
status: final
---

# Technical Design: Package Inclusions and Package Exclusions Catalogs

This document details the technical design for splitting the unstructured, single package tag list into two separate admin-managed catalogs (Package Inclusions and Package Exclusions), including backend master data CRUD APIs, transaction-managed relationship mappings in packages, and a front-end UI revamp.

## Context

The current application has a `tags` master table and a `package_tags` link table, which is poorly structured. The UI displays this as "Inclusions & Exclusions", but the data is stored in a single list with no distinction, and the backend write path does not actually persist the relations.

We are replacing this with two distinct, tenant-scoped, admin-managed catalogs: **Package Inclusions** and **Package Exclusions**.

## Goals / Non-Goals

### Goals
* Create database schemas for `inclusions`, `exclusions`, and their relationship tables.
* Cleanly drop the obsolete `tags` and `package_tags` tables.
* Seed default common Indonesian Umrah items for both catalogs.
* Build full backend CRUD API endpoints (with delete guards against linked packages).
* Update `PackagesService` to atomically update the links in a transaction.
* Update Zod validation schemas and DTO interfaces under `@cometkit/shared`.
* Revamp `/dashboard/settings/master-data` to manage both catalogs.
* Revamp `/dashboard/packages/[id]` to show two separate grids of toggleable buttons for selecting active inclusions and exclusions.

### Non-Goals
* Migrating historical data from the old `tags` table (all legacy tag tables will be dropped).
* Inline creation of new inclusion/exclusion items during package editing.

## Technical Design

### 1. Database Schema (`packages/db/src/schema/packages.ts`)

```typescript
import { boolean, pgTable, varchar, primaryKey, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { timestamps, ulidPk, ulidRef } from "../columns";
import { tenantOwned } from "./tenants";
import { packages } from "./packages"; // (already imported or defined in same file)

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
```

We will delete the `tags` and `packageTags` variables from this file.

### 2. Database Seeding (`packages/db/src/seed.ts` or seed script)

We will seed default values for the first active tenant:
*   **Inclusions**: `Visa`, `Tiket Pesawat PP`, `Hotel Makkah & Madinah`, `Makan 3x`, `Bus AC`, `Muthawif (Guide)`, `Perlengkapan Umrah`, `Asuransi`, `Handling & Airport Tax`, `Kereta Cepat Haramain`.
*   **Exclusions**: `Pembuatan Paspor`, `Vaksin Meningitis`, `Pengeluaran Pribadi`, `Laundry`, `Kelebihan Bagasi`, `Tips Driver & Guide`, `Surcharge Kamar (Double/Triple)`.

### 3. Shared Types (`packages/shared/src/packages.ts`)

```typescript
export interface PackageInclusionDto {
  id: string;
  name: string;
}

export interface PackageExclusionDto {
  id: string;
  name: string;
}

// In PackageDto interface:
// Remove: tags: string[];
// Add:
inclusions: PackageInclusionDto[];
exclusions: PackageExclusionDto[];

// In createPackageSchema:
// Add:
inclusions: z.array(z.string().length(26)).optional(),
exclusions: z.array(z.string().length(26)).optional(),
```

Define corresponding validation schemas for master CRUD:
*   `createInclusionSchema` / `updateInclusionSchema`
*   `createExclusionSchema` / `updateExclusionSchema`

### 4. API Endpoints

We will implement two new modules:
*   `/inclusions` (CRUD)
*   `/exclusions` (CRUD)

Admin guards (`@Roles("admin")`) will protect creation, updating, and deletion.

#### Delete Guard Logic
If a delete request is received:
```typescript
const inUse = await this.db.$count(packageInclusions, eq(packageInclusions.inclusionId, id));
if (inUse > 0) {
  throw new ConflictException("Inclusion is in use by package(s); deactivate it instead of deleting");
}
```

### 5. Package Transactional Updates (`packages.service.ts`)

When creating or updating a package, relationship updates will run within a database transaction:

```typescript
await this.db.transaction(async (tx) => {
  // 1. Update/insert main package row
  // 2. Manage inclusions:
  if (input.inclusions !== undefined) {
    await tx.delete(packageInclusions).where(eq(packageInclusions.packageId, id));
    if (input.inclusions.length > 0) {
      await tx.insert(packageInclusions).values(
        input.inclusions.map((incId) => ({ packageId: id, inclusionId: incId }))
      );
    }
  }
  // 3. Manage exclusions:
  if (input.exclusions !== undefined) {
    await tx.delete(packageExclusions).where(eq(packageExclusions.packageId, id));
    if (input.exclusions.length > 0) {
      await tx.insert(packageExclusions).values(
        input.exclusions.map((excId) => ({ packageId: id, exclusionId: excId }))
      );
    }
  }
});
```

### 6. Frontend Revamp

*   **`use-packages.ts`**: Remove legacy tag hooks. Ensure `usePackage(id)` fetches package inclusions/exclusions.
*   **`use-inclusions.ts` / `use-exclusions.ts`**: Create hook files mirroring `use-airlines.ts` to manage CRUD queries and mutations for inclusions/exclusions.
*   **Settings Master-Data**: Add two `MasterList` sections for Inclusions and Exclusions in `/dashboard/settings/master-data/page.tsx`.
*   **Package Detail Form**:
    *   Fetch active inclusions via `useInclusions()` and active exclusions via `useExclusions()`.
    *   Provide two checkbox/button grids representing selected items.
    *   Include `inclusions` and `exclusions` (arrays of IDs) in the create/update package payload.

## Risks / Trade-offs

*   **[Risk]**: Database migration dropping `tags` and `package_tags` tables.
    *   *Mitigation*: Legitimate schema evolution. Legacy tags were unused, so dropping them is safe.
*   **[Risk]**: Form layout height on packages page.
    *   *Mitigation*: Filter grids to only show `isActive` items, keeping lists clean.
