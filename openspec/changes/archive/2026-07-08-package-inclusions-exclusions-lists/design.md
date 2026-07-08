## Context

The current implementation uses a single, free-text `tags` table and `package_tags` link table, which is poorly structured and lacks admin catalog controls. In practice, this single list is labeled "Inclusions & Exclusions" in the UI, but there is no separation in the data model. This design splits them into two distinct, tenant-global, admin-managed master catalogs: Package Inclusions and Package Exclusions.

## Goals / Non-Goals

**Goals:**
* Define DB schemas for `inclusions`, `exclusions`, `package_inclusions`, and `package_exclusions`.
* Remove obsolete `tags` and `package_tags` schemas and relations.
* Build CRUD APIs for `inclusions` and `exclusions` (controller, service, module, policy).
* Update `packages.service.ts` to support atomic updates of `inclusions` and `exclusions` via database transactions when creating/updating packages.
* Update `@cometkit/shared` payload Zod schemas and the `PackageDto` interface.
* Revamp `/dashboard/settings/master-data` to manage inclusions and exclusions.
* Revamp `/dashboard/packages/[id]` to show separate multi-select lists for inclusions and exclusions.

**Non-Goals:**
* Preserving or migrating existing `tags` data (the old unstructured tags will be cleanly deleted/dropped).
* Allowing free-text tags or inline creation of inclusions/exclusions during package editing.

## Decisions

### 1. Database Schema
We will define four new tables in `packages/db/src/schema/packages.ts`:
* **`inclusions`**: Tenant-global master table for inclusions.
  * Columns: `id` (ULID PK), `tenantId` (ULID FK), `name` (varchar 120), `isActive` (boolean, default true), timestamps.
  * Index: Unique index on `(tenantId, lower(btrim(name)))`.
* **`exclusions`**: Tenant-global master table for exclusions.
  * Columns: `id` (ULID PK), `tenantId` (ULID FK), `name` (varchar 120), `isActive` (boolean, default true), timestamps.
  * Index: Unique index on `(tenantId, lower(btrim(name)))`.
* **`packageInclusions`**: Link table.
  * Columns: `packageId` (references `packages.id` on delete cascade), `inclusionId` (references `inclusions.id`).
  * Primary Key: Composite key on `(packageId, inclusionId)`.
* **`packageExclusions`**: Link table.
  * Columns: `packageId` (references `packages.id` on delete cascade), `exclusionId` (references `exclusions.id`).
  * Primary Key: Composite key on `(packageId, exclusionId)`.

*Alternative considered*: Keeping a single `tags` table and adding a `type` enum (`inclusion` | `exclusion`). We decided against this because separating them into dedicated tables provides cleaner domain boundary isolation, simpler indexing, and matches the established catalog pattern of other master datasets (like `airlines` vs `departureCities`).

### 2. API Update and Transaction Management
* Updating package inclusions/exclusions will happen atomically in the packages write path (`create` and `update` methods in `packages.service.ts`).
* We will use `this.db.transaction` to ensure updates to the package row and its relationship tables are consistent:
  * For update: delete existing relations and insert new ones.
  * In case of any database errors (e.g. referencing an inactive/non-existent inclusion/exclusion id), the transaction will rollback.

### 3. Shared DTOs and Payload Schemas
* In `packages/shared/src/packages.ts`:
  * Update `PackageDto` to include:
    ```typescript
    inclusions: { id: string; name: string }[];
    exclusions: { id: string; name: string }[];
    ```
  * Update `createPackageSchema` to support:
    ```typescript
    inclusions: z.array(z.string().length(26)).optional(),
    exclusions: z.array(z.string().length(26)).optional(),
    ```
  * Update `updatePackageSchema` accordingly.

### 4. Delete Cascade Guard
* Mirroring `hotels`, deleting an inclusion or exclusion will be blocked if there is any active link to a package.
* A `ConflictException` will be thrown if `$count` of links is greater than zero, advising deactivation.

## Risks / Trade-offs

* **[Risk]**: Database migration dropping `tags` and `package_tags` could cause data loss if existing data is active.
  * *Mitigation*: This is a clean batch revamp step where the tags schema was already incomplete and unused in write paths. We will drop them and document the change clearly.
* **[Risk]**: Stale React Query queries in frontend cache.
  * *Mitigation*: Invalidate query keys `["inclusions"]` and `["exclusions"]` on any master data modification.
