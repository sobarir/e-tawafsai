# Comet Design Handoff

- Change: provider-category-commission
- Phase: design
- Mode: compact
- Context hash: 469ae915201113f2e7676484c9e1517f55949949f66de9783a212b808d82eeee

Generated-by: comet-handoff.sh

OpenSpec remains the canonical capability spec. This handoff is a deterministic, source-traceable context pack, not an agent-authored summary.

## openspec/changes/provider-category-commission/proposal.md

- Source: openspec/changes/provider-category-commission/proposal.md
- Lines: 1-32
- SHA256: d80797a85bb380ca55f3d672aace5d6f837faf412490b9e4c6a12e00ac871c20

```md
## Why

Package category is a fixed six-value enum (`regular | plus | private_vip | ramadan | arbain | other`) hardcoded in the schema and the create-package form, so tenants cannot model their own product lines. Commission also lives one level too high — a single default per Provider — even though real commission terms differ per product line (e.g. a Provider's VIP Umrah pays differently than its Regular Umrah). This change lets admins define their own categories, scoped to a Provider and product type, and attaches commission to the category where it belongs. It is change #3 of the Create Package form revamp; change #1 (`hide-inactive-providers-in-package-form`) is archived.

## What Changes

- **BREAKING**: Replace the fixed `category` pgEnum on `packages` with a `categoryId` foreign key to a new admin-defined `package_categories` table. The `PACKAGE_CATEGORIES` enum constant is retired as a persisted type (its six values survive only as seed names).
- Introduce **admin-defined categories** scoped by `(tenant, provider, productType)`, each carrying its own `commissionType` + `commissionValue`.
- **Move commission to the category level.** A category's commission is authoritative going forward. The Provider's `defaultCommissionType`/`defaultCommissionValue` remain as the **seed/fallback** used to prefill a new category's commission (Provider commission fields and their admin-only UI stay).
- **Migrate existing data**: for every `(provider, productType, legacy-category)` combination actually used by existing packages, create a category row seeded from the Provider's current commission, and repoint each package to its `categoryId`. Additionally seed the six legacy names per Provider so dropdowns have sensible defaults.
- **Package form**: the category dropdown is filtered by the selected Provider + product type; publish requires a valid `categoryId`.
- **Provider detail page**: new admin-only section to create/edit/delete categories (grouped by product type) with their commission. A category in use by packages cannot be hard-deleted.
- **Search**: adapt the category filter to work against admin-defined categories instead of the removed enum.

## Capabilities

### New Capabilities
- `provider-category-commission`: admin-defined package categories scoped by `(tenant, provider, productType)`, each owning a `commissionType`/`commissionValue`; category CRUD; commission seeding from the Provider default; deletion guard for in-use categories.

### Modified Capabilities
- `package-catalog`: a package's `category` becomes a required FK (`categoryId`) into the tenant's admin-defined categories rather than the fixed enum; publish validation requires `categoryId`; the category must belong to the package's Provider + product type.
- `provider-management`: Provider commission fields are redefined as the seed/default for new categories rather than the operative commission; category-level commission is admin-only under the same role-aware DTO rules.
- `package-search`: the category filter operates over admin-defined categories (by id/name) instead of the fixed enum.
- `user-management`: staff users never receive category-level commission fields, extending the existing commission-stripping guarantee to the new category commission.

## Impact

- **`packages/db`**: new `package_categories` table + `category_id` FK on `packages`; migration to backfill categories and repoint packages; drop the `category` pgEnum column. Seed script updates.
- **`packages/shared`**: retire `PACKAGE_CATEGORIES` as a persisted enum; new category request schemas + `CategoryDto` (admin) with commission; update package + publish + search schemas/DTOs to use `categoryId`.
- **`apps/api`**: category CRUD service/controller (admin-guarded, tenant-scoped) surfaced under providers; packages service maps `categoryId`; search service joins categories; typed mappers keep contract↔persistence aligned.
- **`apps/web`**: provider detail page category-management UI (admin-only); create-package form provider+type-filtered category dropdown; search filter update; TanStack Query hooks for categories.
- **Data/behavior**: one-time migration of existing packages; no pricing-engine change (commission remains reference metadata today).
```

## openspec/changes/provider-category-commission/design.md

- Source: openspec/changes/provider-category-commission/design.md
- Lines: 1-63
- SHA256: c841fdf6b794218de340db2bc022fa89d1376cc81a2cb957fdb2a2d211554b20

```md
## Context

Today `packages.category` is a Postgres enum (`category` pgEnum over the six `PACKAGE_CATEGORIES` values), hardcoded as `<option>`s in the create-package form and referenced by the search filter and publish validation. Commission lives on `providers` as a single `defaultCommissionType`/`defaultCommissionValue`/`commissionNotes` triple, is admin-only (stripped from `StaffProviderDto`), and is **pure reference metadata** — no pricing code consumes it (verified: `defaultCommission*` is read only by the providers CRUD/display path).

Tenants need per-tenant product lines and commission that varies by product line, not one flat default per Provider. Multi-tenancy, provider-management, package-catalog, and package-search capabilities already exist and are the integration seams. This is change #3 of the Create Package form revamp (order 1→3→2→4→5); it merges to `main` locally before the next change.

## Goals / Non-Goals

**Goals:**
- Admin-defined categories scoped by `(tenant, provider, productType)`, each owning `commissionType` + `commissionValue`.
- `packages.category` enum → `categoryId` FK (single source of truth; name read by join, no denormalized copy).
- Provider `defaultCommission*` becomes the seed used to prefill a new category's commission; category commission is authoritative thereafter.
- Non-destructive migration of existing packages; every package ends on a valid `categoryId`.
- Form category dropdown filtered by selected Provider + product type; search filter adapted; publish requires `categoryId`.
- Category commission is admin-only (same guarantee as Provider commission).

**Non-Goals:**
- No pricing-engine work — commission stays reference metadata.
- No per-category commission *notes* (notes remain at Provider level).
- Airline/city master data (#2), hotel catalog (#4), inclusions/exclusions (#5) — separate changes.
- No public-surface changes beyond the existing search filter.

## Decisions

**D1 — New `package_categories` table, category scoped by `(tenant, provider, productType)`.**
Columns: `id` (ULID), tenant ownership, `providerId` FK, `productType` (product_type enum), `name` (varchar), `commissionType` (commission_type enum), `commissionValue` (integer). Unique on `(tenant_id, provider_id, product_type, lower(btrim(name)))` so the same name may exist under different Provider/type but not collide within one. Rationale: mirrors the Provider uniqueness idiom already in the repo; scoping key matches the form filter exactly.
- *Alternative considered*: global-per-tenant categories with a separate applicability table → rejected as over-engineered; scope is inherently per Provider+type.

**D2 — `packages.categoryId` FK, drop the enum column.**
Replace `category` enum column with `category_id` ULID FK → `package_categories.id` (`NOT NULL` after backfill). Name is read via join in package/search read paths. Rationale: DRY — one source of truth, rename-safe.
- *Alternative considered*: keep a denormalized name string → rejected (drift risk on rename; user chose FK-only).

**D3 — Provider commission stays as seed/fallback.**
Keep `providers.defaultCommission*` and their admin UI. When an admin creates a new category, prefill commission from the Provider default. Migration seeds each created category's commission from the Provider's current default. Rationale: preserves existing partner-default semantics while making category the operative level.

**D4 — Migration: backfill in-use combos + seed legacy names.**
Migration (SQL + data step) runs: (a) for each distinct `(provider_id, product_type, category)` present in `packages`, upsert a `package_categories` row (name = legacy value, commission = Provider default); (b) additionally seed the six legacy names per Provider under each product type in use, so dropdowns are populated; (c) set `packages.category_id` by matching, then enforce `NOT NULL` and drop the old enum column. Seed script (`packages/db/src/seed.ts`) updated to create demo categories directly. Rationale: no package is orphaned; dropdowns are usable immediately.

**D5 — Category CRUD API surfaced under providers, admin-guarded.**
New Nest module (categories) with `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles("admin")`, tenant-scoped. Endpoints: list by `providerId` (+ optional `productType`), create, update, delete. Delete is blocked (`ConflictException`) when any package references the category. `CategoryDto` carries commission and is admin-only; staff never receive it (extends the existing role-aware DTO convention). Rationale: reuses established RBAC + DTO seams.

**D6 — Web: category management on the Provider detail page.**
Admin-only section on `/dashboard/providers/[id]`, categories grouped by product type, each row editable with commission; create prefilled from Provider default. Create-package form (`/dashboard/packages/[id]`) replaces the hardcoded `<select>` with a data-driven dropdown filtered by the chosen `providerId` + `productType` (TanStack Query hook, key `["categories", providerId, productType]`). Search filter reads categories similarly.

## Risks / Trade-offs

- **Migration correctness on live data** → dry-run against a seeded DB; verify every package has a non-null `category_id` before the `NOT NULL` + enum-drop step; the `NOT NULL`/drop is a separate final migration guarded by a count check.
- **Enum removal ripples** (shared type, search schema, publish schema, spec files) → `bun run verify` gate; typed mappers surface any dangling `category` string usage at compile time.
- **Search filter semantics change** (free-form names across Providers) → filter by category id where a Provider is selected; by name match otherwise. Confirm exact behavior in `/comet-design` delta spec.
- **Category name collision on rename** → enforced by the unique index; API returns `ConflictException` with a field error.
- **Cross-scope assignment** (assigning a category that doesn't belong to the package's Provider+type) → validated in the packages service against the category's scope.

## Migration Plan

1. Add `package_categories` table + `category_id` nullable FK on `packages` (migration 1).
2. Data migration: backfill categories from in-use combos + seed legacy names; set `category_id`.
3. Enforce `category_id NOT NULL` and drop the `category` enum column (migration 2, after count check).
4. Rollback: migrations are additive-then-cutover; before step 3, dropping `category_id` and the table restores the enum path. After step 3, roll back by re-adding the enum column from `package_categories.name`.

## Open Questions

- Exact search-filter behavior when no Provider is selected (id vs name match) — resolve in `/comet-design` delta spec.
- Whether legacy-name seeding should cover all three product types or only those a Provider actually uses — leaning "in use only" to avoid noise; confirm in design.
```

## openspec/changes/provider-category-commission/tasks.md

- Source: openspec/changes/provider-category-commission/tasks.md
- Lines: 1-42
- SHA256: 436bc6297c3d1574b5c3b393b48539846d4ee54008c30ea898c68b8f9ad49c6b

```md
## 1. Shared contracts (packages/shared)

- [ ] 1.1 Retire `PACKAGE_CATEGORIES` as a persisted enum; keep the six values as an exported `LEGACY_CATEGORY_NAMES` seed constant only
- [ ] 1.2 Add category request schemas (`createCategorySchema`, `updateCategorySchema`) with `name`, `commissionType`, `commissionValue` (reuse `COMMISSION_TYPES`)
- [ ] 1.3 Add `CategoryDto` (admin, includes commission) and a staff-safe category shape (no commission); export `productType`/`providerId` scope fields
- [ ] 1.4 Update `createPackageSchema`/`updatePackageSchema` to use `categoryId` (ULID) instead of `category`; update `publishPackageSchema` to require `categoryId`
- [ ] 1.5 Update `PackageDto` (`category: string` → `categoryId: string` + resolved `categoryName`); update `search.ts` category filter field to reference categories

## 2. Database schema (packages/db)

- [ ] 2.1 Add `package_categories` table: ULID pk, tenant ownership, `providerId` FK, `productType` (product_type enum), `name`, `commissionType`, `commissionValue`, timestamps; unique index on `(tenant_id, provider_id, product_type, lower(btrim(name)))`
- [ ] 2.2 Add nullable `category_id` FK on `packages` → `package_categories.id`; generate migration A additive (`db:generate`)
- [ ] 2.3 Write backfill runner `category-backfill-runner.ts` + pure `scripts/backfill-categories.ts` (script `db:backfill-categories`): per tenant, upsert categories from in-use `(provider, productType, category)` seeded from provider default commission; seed `LEGACY_CATEGORY_NAMES` under umrah + any in-use type; set `packages.category_id`; idempotent + count-check log
- [ ] 2.4 Generate migration B cutover: drop the `category` enum column + `category` pgEnum (no NOT NULL step — `category_id` stays nullable)
- [ ] 2.5 Update `seed.ts` to create demo categories directly and point demo packages at `categoryId`

## 3. API — categories module (apps/api)

- [ ] 3.1 Create categories Nest module: service + controller, `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles("admin")`, tenant-scoped, surfaced under providers
- [ ] 3.2 Implement list (by `providerId` + optional `productType`), create (seed commission from provider default when omitted), update, delete
- [ ] 3.3 Enforce uniqueness pre-check (`409 Conflict`) and in-use delete guard (`409 Conflict`)
- [ ] 3.4 Typed `toCategoryDto` mapper (admin) + staff-safe mapper stripping commission
- [ ] 3.5 Category policy pure functions in `categories.policy.ts` (scope/ownership decisions)

## 4. API — packages & search wiring (apps/api)

- [ ] 4.1 Packages service: map `categoryId`; validate assigned category belongs to package's provider + productType; update publish validation to require valid `categoryId`
- [ ] 4.2 Search service: join `package_categories`; adapt category filter to `categoryId`/name; keep tenant scoping

## 5. Web — category management + form (apps/web)

- [ ] 5.1 TanStack Query hooks `use-categories.ts` (key `["categories", providerId, productType]`) + mutations invalidating the resource root
- [ ] 5.2 Provider detail page: admin-only category-management section grouped by product type; create prefilled from provider default; edit/delete with in-use guard messaging via `readApiError()`
- [ ] 5.3 Package form: replace hardcoded `<select>` with data-driven dropdown filtered by selected provider + productType; refresh on provider/type change
- [ ] 5.4 Search filter: replace fixed category options with admin-defined categories

## 6. Tests & verification

- [ ] 6.1 Unit specs: `categories.policy.spec.ts` (scope/uniqueness/delete-guard) + packages publish/category-scope validation
- [ ] 6.2 Integration spec: `categories.service.int.spec.ts` (CRUD, seeding from provider default, delete guard, tenant isolation) — cleans up its own rows
- [ ] 6.3 Migration integration check: every existing package resolves to a non-null `category_id` after backfill
- [ ] 6.4 `bun run verify` passes (typecheck + lint + test); run `db:migrate` then `db:seed` to confirm end-to-end
```

## openspec/changes/provider-category-commission/specs/package-catalog/spec.md

- Source: openspec/changes/provider-category-commission/specs/package-catalog/spec.md
- Lines: 1-35
- SHA256: 196954a166ae00bf70b365c2a27895a53ab12e4a8ee0c5d62601d6981609d8d4

```md
## MODIFIED Requirements

### Requirement: Package entity with structured fields
The system SHALL provide tenant-scoped CRUD for Packages with: provider ref, `productType` (`umrah`|`haji_khusus`|`haji_furoda`), `title`, per-tenant unique `slug`, `categoryId` (a **nullable** reference to an admin-defined Package Category scoped to the package's Provider and `productType`; required at publish per the Publish validation requirement), `plusDestination` (nullable), `durationDays`, `description`, inclusions/exclusions tags, flyer images, structured hotel fields stored in a one-to-many list by city (`cityName`, `name`, `stars`, `distanceM` (nullable), `isPelataran` (boolean)), `airline`, `flightRoute`, `departureCity`, `isFeatured`, `status` (`draft`|`published`|`archived`). The former fixed `category` enum (`regular`|`plus`|`private_vip`|`ramadan`|`arbain`|`other`) is REPLACED by the `categoryId` reference. Duration, category, airline, departure city, and hotel fields SHALL be structured (not free text). When set, an assigned category MUST belong to the package's Provider and `productType`.

#### Scenario: Create draft package
- **WHEN** an admin creates a package with title and provider only
- **THEN** it is saved as `draft` and listed in the admin catalog

#### Scenario: Only umrah creatable in Phase 1
- **WHEN** a package create/update specifies `productType` other than `umrah`
- **THEN** the request is rejected (enum seam exists; unlock ships with C18)

#### Scenario: Category must match provider and product type
- **WHEN** a package create/update sets a `categoryId` whose category is not scoped to the package's Provider and `productType`
- **THEN** the request is rejected with a field-level error

#### Scenario: Draft may have no category
- **WHEN** an admin saves a package as a draft without a `categoryId`
- **THEN** the draft is saved with a null category and remains editable (publish will later require a category)

### Requirement: Publish validation
Publishing SHALL be blocked with field-level errors unless: `durationDays`, at least one Makkah hotel, `airline`, `departureCity`, and a valid `categoryId` (referencing a category scoped to the package's Provider and `productType`) are present, and the package's Provider is active with the license required by the `productType` (umrah → `ppiuLicenseNo`). Drafts MAY be incomplete. Only `published` packages are ever exposed publicly (consumed by later changes). Transit hotels and flyer uploads are optional.

#### Scenario: Publish blocked on missing Makkah hotel
- **WHEN** the agent publishes a package missing a Makkah hotel
- **THEN** publish is rejected with a field-level error naming the missing field

#### Scenario: Publish blocked on inactive provider
- **WHEN** the agent publishes a package whose provider is inactive
- **THEN** publish is rejected with an explanatory error

#### Scenario: Publish blocked on missing category
- **WHEN** the agent publishes a package without a `categoryId`
- **THEN** publish is rejected with a field-level error naming the missing category
```

## openspec/changes/provider-category-commission/specs/package-search/spec.md

- Source: openspec/changes/provider-category-commission/specs/package-search/spec.md
- Lines: 1-24
- SHA256: 1d8f29612eb3920bf0bab62a76d3a00ba64dcf279be9bc5510af667573de9e71

```md
## MODIFIED Requirements

### Requirement: Combined-filter search with departure semantics
The admin search SHALL combine filters — max price (quad by default, occupancy selectable), departure month/date range, duration range, category, airline, direct-only, hotel max distance (Makkah and/or Madinah), min stars, departure city, provider, seats-available-only — and SHALL return only packages having at least one departure satisfying all departure-level predicates (`open`/`almost_full`, date in range, price within budget, seats available when toggled). The category filter SHALL operate over admin-defined Package Categories by matching the category **name** (a package matches when its `categoryId` resolves to a category whose name equals the selected value), across providers, rather than the retired fixed category enum. The filter control lists the distinct category names in the tenant. Direct-only filters on an explicit `packages.directOnly` boolean. The max-price predicate compares against the selected occupancy's price, falling back to `priceQuad` when that occupancy's price is null. All queries are tenant-scoped. The admin search screen surfaces all of these filter controls.

#### Scenario: PRD acceptance filter combination
- **WHEN** the agent searches duration 9, max price 30,000,000, month September
- **THEN** results contain only packages with `durationDays = 9` having ≥1 open September departure with `priceQuad ≤ 30,000,000`

#### Scenario: Seats-available-only toggle
- **WHEN** the toggle is on and a package's only matching departure has `seatAvailable = 0`
- **THEN** that package is excluded

#### Scenario: Direct-only filter
- **WHEN** the direct-only toggle is on
- **THEN** results contain only packages with `directOnly = true`

#### Scenario: Occupancy price fallback
- **WHEN** the max-price filter selects triple occupancy and a matching departure has `priceTriple = null`
- **THEN** the price predicate for that departure compares the max price against `priceQuad`

#### Scenario: Category filter over admin-defined categories
- **WHEN** the agent filters by a category name
- **THEN** results contain only packages whose `categoryId` resolves to a category with that name, across all providers
```

## openspec/changes/provider-category-commission/specs/provider-category-commission/spec.md

- Source: openspec/changes/provider-category-commission/specs/provider-category-commission/spec.md
- Lines: 1-53
- SHA256: 448ea28506faed83d4a54ec3fa3e7dc7e18997d084369425f27d253cceb1b04a

```md
## ADDED Requirements

### Requirement: Admin-defined categories scoped by provider and product type
The system SHALL provide tenant-scoped CRUD for Package Categories, each scoped by `(providerId, productType)` and carrying `name`, `commissionType` (`flat_per_pax`|`percent_of_price`), and `commissionValue` (integer). A category's `name` SHALL be unique within its `(tenant, provider, productType)` scope on the normalized name (`lower(trim(name))`); the same name MAY exist under a different Provider or product type. Category CRUD SHALL be admin-only (`@Roles("admin")`) and MUST NOT be exposed to `staff` users.

#### Scenario: Create category under a provider and product type
- **WHEN** an admin creates a category named "VIP" under Provider X for `umrah` with a commission
- **THEN** the category is saved scoped to (Provider X, umrah) and appears when listing that provider+type's categories

#### Scenario: Same name allowed across different scope
- **WHEN** an admin creates a category "Regular" under Provider X/umrah and another "Regular" under Provider Y/umrah
- **THEN** both are allowed because the uniqueness scope is `(tenant, provider, productType)`

#### Scenario: Duplicate name within one scope rejected
- **WHEN** an admin creates a second category whose normalized name equals an existing category under the same Provider and product type
- **THEN** the request is rejected with `409 Conflict` and no row is inserted

#### Scenario: Category CRUD is admin-only
- **WHEN** a staff user calls any category create/update/delete endpoint
- **THEN** the API returns `403`

### Requirement: Category owns commission, seeded from the provider default
Each category SHALL own its `commissionType` and `commissionValue`, which are authoritative for that category. When a new category is created without an explicit commission, the system SHALL seed it from the owning Provider's `defaultCommissionType`/`defaultCommissionValue`. Category commission SHALL be admin-only, stripped from any response returned to `staff` users via role-aware response DTOs.

#### Scenario: New category seeded from provider default
- **WHEN** an admin creates a category without specifying commission and the Provider's default is `flat_per_pax` / 500000
- **THEN** the created category's commission is `flat_per_pax` / 500000

#### Scenario: Category commission stripped for staff
- **WHEN** a staff user receives any payload that includes categories
- **THEN** the payload contains no `commissionType`/`commissionValue` keys for those categories

### Requirement: In-use categories cannot be hard-deleted
A category referenced by at least one package SHALL NOT be hard-deleted; the delete request SHALL be rejected with `409 Conflict` naming the blocking usage. Categories with no referencing packages MAY be deleted.

#### Scenario: Delete blocked while packages reference the category
- **WHEN** an admin deletes a category that at least one package uses
- **THEN** the request is rejected with `409 Conflict` and the category is retained

#### Scenario: Unused category deleted
- **WHEN** an admin deletes a category that no package references
- **THEN** the category is removed

### Requirement: Package form category dropdown filtered by provider and product type
The create/edit package form SHALL populate the category selector only with categories belonging to the currently selected Provider and product type. Changing the selected Provider or product type SHALL refresh the available categories.

#### Scenario: Dropdown lists only in-scope categories
- **WHEN** an admin selects Provider X and product type `umrah` in the package form
- **THEN** the category dropdown lists only categories scoped to (Provider X, umrah)

#### Scenario: Changing provider refreshes categories
- **WHEN** the admin changes the selected Provider to Provider Y
- **THEN** the category dropdown reloads with Provider Y's categories for the current product type
```

## openspec/changes/provider-category-commission/specs/provider-management/spec.md

- Source: openspec/changes/provider-category-commission/specs/provider-management/spec.md
- Lines: 1-12
- SHA256: 873ccf513c98492dcefa0d6e09b7c43c452539b68aad9d640adf02fcc648781f

```md
## MODIFIED Requirements

### Requirement: Commission fields are admin-only
Provider commission fields (`defaultCommissionType`, `defaultCommissionValue`, `commissionNotes`) SHALL never be returned to `staff` users nor rendered in staff views, enforced via role-aware response DTOs. The Provider `defaultCommissionType`/`defaultCommissionValue` SHALL serve as the seed/default used to prefill the commission of a newly created Package Category for that Provider; the operative commission for a package is carried by its category, not the Provider. Category-level commission fields SHALL be admin-only under the same role-aware DTO rules.

#### Scenario: Staff opens provider detail
- **WHEN** a staff user requests a provider detail
- **THEN** the response body contains no commission keys and the UI renders no commission section

#### Scenario: Provider default seeds a new category
- **WHEN** an admin adds a category for a Provider and does not override the commission
- **THEN** the new category's commission is prefilled from the Provider's `defaultCommissionType`/`defaultCommissionValue`
```

## openspec/changes/provider-category-commission/specs/user-management/spec.md

- Source: openspec/changes/provider-category-commission/specs/user-management/spec.md
- Lines: 1-18
- SHA256: 74685f864a6f0c867a48f2a90ef78c75004c63f56d193a5617603c1cf1f685e4

```md
## MODIFIED Requirements

### Requirement: Staff restrictions on settings and commission data
`staff` users SHALL have no access to Settings and SHALL never receive commission fields — provider commission (`defaultCommissionType`, `defaultCommissionValue`, `commissionNotes`), category-level commission (`commissionType`, `commissionValue` on Package Categories), and future per-package overrides — in any API response. Enforcement SHALL be structural (role-aware response DTOs), not per-handler filtering.

> **Boundary — realized across changes.** auth-rbac establishes the enforcement seams: the `@Roles("admin")` guard pattern (applied to the settings controller when it lands in `tenant-settings`) and the staff-DTO convention (the generic role-aware field-stripping helper and the first commission DTO pair land in `provider-management`). Category-level commission extends the same staff-DTO convention in `provider-category-commission`.

#### Scenario: Commission fields stripped for staff
- **WHEN** a staff user requests a provider detail (once providers exist)
- **THEN** the response contains no commission fields and the UI renders none

#### Scenario: Settings blocked for staff
- **WHEN** a staff user calls any settings endpoint (once settings exist)
- **THEN** the API returns 403

#### Scenario: Category commission stripped for staff
- **WHEN** a staff user receives any response that includes categories
- **THEN** the response contains no category commission fields
```

