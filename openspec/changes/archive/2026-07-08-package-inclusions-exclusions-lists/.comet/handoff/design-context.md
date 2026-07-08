# Comet Design Handoff

- Change: package-inclusions-exclusions-lists
- Phase: design
- Mode: compact
- Context hash: 57aedcb5aad3d779f435b6b6eb049579032f497de6744b6de798984ffce9039c

Generated-by: comet-handoff.sh

OpenSpec remains the canonical capability spec. This handoff is a deterministic, source-traceable context pack, not an agent-authored summary.

## openspec/changes/package-inclusions-exclusions-lists/proposal.md

- Source: openspec/changes/package-inclusions-exclusions-lists/proposal.md
- Lines: 1-31
- SHA256: e4af1fdbd9848f7bea426da91840f4ebc97e614c24865877c7e02f92062c30ed

```md
## Why

The existing package tag system is unstructured, lacks admin-managed control, and combines inclusions and exclusions into a single list. Transitioning to separate, tenant-global master catalogs for Package Inclusions and Package Exclusions ensures consistent catalog curation, prevents data fragmentation from free-text entries, and simplifies package creation.

## What Changes

* **Database Schemas**:
  * **New Master Tables**: Add `inclusions` and `exclusions` tables, each with tenant scoping, name, and activation status.
  * **New Link Tables**: Add `package_inclusions` and `package_exclusions` tables to establish the relations with packages.
  * **Deletions**: Remove the obsolete `tags` and `package_tags` tables.
* **Backend API**:
  * **CRUD Endpoints**: Create CRUD controllers, modules, and policies for both `inclusions` and `exclusions`.
  * **Package Updates**: Modify the Package endpoints to handle direct assignment of `inclusions` and `exclusions` (arrays of IDs).
  * **Deletions**: Remove old tag-related controllers and endpoints.
* **Shared Types & Schemas**:
  * **Zod Schemas**: Update package payload schemas in `@cometkit/shared` to include `inclusions` and `exclusions` arrays of ULID strings.
  * **DTOs**: Update `PackageDto` to replace `tags: string[]` with separate arrays for inclusions and exclusions.
* **Frontend UI**:
  * **Master Data Settings**: Add "Package Inclusions" and "Package Exclusions" management cards to `/dashboard/settings/master-data` for admin CRUD operations.
  * **Package Creation/Editing**: Revamp the Package details form to replace the tags card with two separate multi-select checkbox grids for Inclusions and Exclusions.

## Capabilities

### Modified Capabilities
* `package-catalog`: Modify the requirement for package tags to instead require two separate, admin-curated lists of Inclusions and Exclusions. Remove the capability to add arbitrary free-text tags during package creation/editing.

## Impact

* **Database**: Requires generating and running migrations to drop `tags` and `package_tags` and create the new master and relationship tables.
* **API Breakage**: External API clients using the old `tags` fields or endpoints will need to transition to the new `inclusions` and `exclusions` properties.
* **Frontend**: UI updates to pages `/dashboard/settings/master-data` and `/dashboard/packages/[id]` to consume the new endpoints and hook structures.
```

## openspec/changes/package-inclusions-exclusions-lists/design.md

- Source: openspec/changes/package-inclusions-exclusions-lists/design.md
- Lines: 1-68
- SHA256: 4e5bb13d0f76147679eb7dc1ae6d6fdbfd36db3260eb2e417971d89769805fd4

```md
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
```

## openspec/changes/package-inclusions-exclusions-lists/tasks.md

- Source: openspec/changes/package-inclusions-exclusions-lists/tasks.md
- Lines: 1-30
- SHA256: c35d93a164e33ea30755d169c43997f81cb5c73dc8061e796fc04b789250401d

```md
## 1. Database Schema & Migration

- [ ] 1.1 Modify `packages/db/src/schema/packages.ts` to define `inclusions`, `exclusions`, `packageInclusions`, and `packageExclusions` tables, and remove `tags` and `packageTags` tables.
- [ ] 1.2 Generate database migrations using `bun run db:generate`.
- [ ] 1.3 Apply database migrations using `bun run db:migrate`.

## 2. Shared Types & Schemas

- [ ] 2.1 Update `packages/shared/src/packages.ts` to include `createInclusionSchema`, `updateInclusionSchema`, `createExclusionSchema`, `updateExclusionSchema`, and updated package validation schemas/DTOs. Remove tag schemas.
- [ ] 2.2 Rebuild packages or verify types check across the workspace.

## 3. Backend API Implementation

- [ ] 3.1 Implement inclusions controller, service, module, and policy under `apps/api/src/inclusions`.
- [ ] 3.2 Implement exclusions controller, service, module, and policy under `apps/api/src/exclusions`.
- [ ] 3.3 Register new modules in `apps/api/src/app.module.ts`.
- [ ] 3.4 Update `PackagesService` to save inclusions and exclusions atomically using `this.db.transaction` in create/update methods.
- [ ] 3.5 Update `PackagesController` to remove tag endpoints.

## 4. Frontend Implementation

- [ ] 4.1 Create hooks `use-inclusions.ts` and `use-exclusions.ts` in `apps/web/src/hooks` and update package hooks.
- [ ] 4.2 Revamp `/dashboard/settings/master-data` UI to manage inclusions and exclusions catalogs.
- [ ] 4.3 Revamp `/dashboard/packages/[id]` form to select inclusions and exclusions via separate checkbox grids.

## 5. Verification & Tests

- [ ] 5.1 Implement integration tests for inclusions/exclusions API.
- [ ] 5.2 Implement package integration tests verifying inclusions/exclusions.
- [ ] 5.3 Run `bun run verify` and ensure all quality checks pass.
```

## openspec/changes/package-inclusions-exclusions-lists/specs/package-catalog/spec.md

- Source: openspec/changes/package-inclusions-exclusions-lists/specs/package-catalog/spec.md
- Lines: 1-44
- SHA256: e99263da9127fe305d0779d0edf0668a8dfa051a748cfb2a86ea9fc6de85fcde

```md
## ADDED Requirements

### Requirement: Package Inclusions and Package Exclusions as tenant-global master catalogs
The system SHALL provide separate, tenant-global master catalogs for Package Inclusions and Package Exclusions. Admins SHALL be able to perform CRUD operations (create, rename, toggle active status, and delete) on inclusions and exclusions via settings master-data.

#### Scenario: Admin creates inclusion
- **WHEN** an admin adds a new inclusion with a unique name
- **THEN** it is saved to the tenant's inclusions master catalog

#### Scenario: Admin creates exclusion
- **WHEN** an admin adds a new exclusion with a unique name
- **THEN** it is saved to the tenant's exclusions master catalog

#### Scenario: Unique constraint on name per tenant
- **WHEN** an admin tries to create an inclusion or exclusion with a name that already exists in that tenant (case-insensitive, trimmed)
- **THEN** the request is rejected with a conflict error

### Requirement: Package creation and editing with separate inclusions and exclusions selections
During package creation and editing, the admin user SHALL be able to select multiple active inclusions and exclusions from the respective tenant-global master catalogs. These selections SHALL be saved atomically with the package. Free-text additions during package creation/editing SHALL NOT be allowed.

#### Scenario: Save inclusions and exclusions on package create
- **WHEN** an admin creates a package and selects active inclusions and exclusions
- **THEN** the package is created and successfully linked to those inclusions and exclusions

#### Scenario: Update inclusions and exclusions on package edit
- **WHEN** an admin updates a package's inclusions and exclusions selections
- **THEN** the links are updated to match the new selections

### Requirement: Cascade delete guard on inclusions and exclusions
An inclusion or exclusion that is currently linked to one or more packages SHALL NOT be deleted. The system SHALL reject deletion requests and recommend deactivation instead.

#### Scenario: Prevent deletion of linked inclusion
- **WHEN** an admin attempts to delete an inclusion that is linked to a package
- **THEN** the delete request is rejected with a conflict error

#### Scenario: Prevent deletion of linked exclusion
- **WHEN** an admin attempts to delete an exclusion that is linked to a package
- **THEN** the delete request is rejected with a conflict error

## REMOVED Requirements

### Requirement: Inclusions and exclusions as seeded tag multi-selects
**Reason**: Replaced by separate admin-managed inclusions and exclusions master catalogs to prevent free-text fragmentation and improve structured data consistency.
**Migration**: Dropped the old `tags` and `package_tags` tables. Any seeded or custom tags are superseded by the new `inclusions` and `exclusions` catalogs.
```

