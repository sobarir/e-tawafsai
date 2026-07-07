# Comet Design Handoff

- Change: airline-departure-city-master-data
- Phase: design
- Mode: compact
- Context hash: 9960cf0d715954233e7ad19d379663a9172499def1a474a5b9f12843f354604b

Generated-by: comet-handoff.sh

OpenSpec remains the canonical capability spec. This handoff is a deterministic, source-traceable context pack, not an agent-authored summary.

## openspec/changes/airline-departure-city-master-data/proposal.md

- Source: openspec/changes/airline-departure-city-master-data/proposal.md
- Lines: 1-29
- SHA256: cff5359c9a4cb1c0fa80f5bfac85590c4c241ac436df59737ec7609d4c683c38

```md
## Why

A package's `airline` and `departureCity` are free-text `varchar(120)` columns typed by hand on the create-package form, so the same airline or city is spelled inconsistently across packages, cannot be governed by admins, and gives buyers no reliable dropdown to pick from. This change replaces the two free-text fields with tenant-global master tables (`airlines`, `departure_cities`) that admins manage and the form selects from. It is change #2 of the Create Package form revamp; changes #1 (`hide-inactive-providers-in-package-form`) and #3 (`provider-category-commission`) are archived.

## What Changes

- **BREAKING**: Replace the free-text `airline` and `departure_city` columns on `packages` with nullable foreign keys `airlineId` and `departureCityId` into two new admin-defined master tables.
- Introduce two **tenant-global master tables** — `airlines` and `departure_cities` — each with a normalized-name uniqueness per tenant and an `isActive` flag for retiring rows without deleting them.
- **Admin CRUD** for both, surfaced under **Settings** (alongside Templates): create / edit / activate / deactivate. A row in use by any package cannot be hard-deleted; retire it via `isActive` instead.
- **Migrate existing data**: seed a starter list of common Indonesian-market airlines and departure cities, and backfill every package's current free-text value into a matching (case-insensitive) master row — creating a master row for any unmatched value so no data is lost — then repoint each package to its FK.
- **Package form**: the airline and departure-city inputs become dropdowns sourced from the tenant's **active** master rows; a currently-assigned row is preserved when editing even if it has since been deactivated. Publish still **requires** both to be set.
- **Search**: adapt the search read path to join the master tables so responses continue to expose airline / departure-city **names** (result cards and share text are unchanged); the airline / departure-city filters match against the joined names.

## Capabilities

### New Capabilities
- `airline-departure-city-master-data`: tenant-global admin-defined `airlines` and `departure_cities` master tables scoped by tenant, each with normalized-name uniqueness and an `isActive` flag; CRUD for both under Settings; deletion guard for in-use rows; starter seed + one-time backfill of existing package values.

### Modified Capabilities
- `package-catalog`: a package's `airline` and `departureCity` become nullable FKs (`airlineId`, `departureCityId`) into the tenant's master tables instead of free text; publish validation requires both; a selected row must belong to the package's tenant.
- `package-search`: the airline and departure-city filters operate over the master tables (by joined name); response DTOs expose the airline / departure-city name via join rather than a persisted string.

## Impact

- **`packages/db`**: new `airlines` and `departure_cities` tables + `airline_id` / `departure_city_id` FKs on `packages`; migration to backfill from the existing free-text columns and drop them; seed script adds starter master rows and maps the seeded package.
- **`packages/shared`**: new master-data request schemas + `AirlineDto` / `DepartureCityDto`; update package create/update/publish schemas and package DTOs to use `airlineId` / `departureCityId`; keep airline / departure-city **names** on read DTOs (package + search) via mapper.
- **`apps/api`**: new `airlines` and `departure-cities` modules (service / controller / policy, admin-guarded, tenant-scoped) mirroring `categories`; packages service maps the FKs; search service joins the master tables; typed mappers keep contract↔persistence aligned.
- **`apps/web`**: Settings admin UI for both master lists (admin-only) + TanStack Query hooks; create-package form airline / departure-city dropdowns with keep-assigned-when-editing behavior; search filter reads master names.
- **Data/behavior**: one-time migration + backfill of existing packages; no pricing or itinerary change.
```

## openspec/changes/airline-departure-city-master-data/design.md

- Source: openspec/changes/airline-departure-city-master-data/design.md
- Lines: 1-60
- SHA256: 0ad2a9f9a03cb8507a4187ab78332a1e89214650c298dfc3824c348469cd0a02

```md
## Context

`packages.airline` and `packages.departure_city` are free-text `varchar(120)` columns (nullable, but required at publish via the shared publish schema). They are typed by hand on the create-package form, read back on the form, exposed on package DTOs, and surfaced in package search (both as a filter and on the result card / share text). The seed sets `"Saudi Arabian Airlines"` / `"Jakarta"` on the demo package.

The repo already has three master-data idioms to mirror:
- **`tags`** — tenant-global master, unique per tenant, `tenantOwned()`.
- **`package_categories`** (change #3, just archived) — the FK-cutover pattern: nullable FK added, data backfilled inside the migration, old column dropped; name read via join; admin CRUD module mirroring shape.
- **`providers.isActive`** (change #1) — active-filtering of dropdown options while preserving a currently-assigned value when editing.

Migrations are authored by running `db:generate` for the additive DDL, then hand-adding backfill `INSERT`/`UPDATE` steps and the column-drop cutover into the generated SQL (see `drizzle/0016_late_venus.sql`).

## Goals / Non-Goals

**Goals:**
- Two tenant-global master tables (`airlines`, `departure_cities`) with normalized-name uniqueness per tenant and an `isActive` retire flag.
- Admin CRUD for both under Settings, mirroring the categories module shape.
- Form dropdowns sourced from active rows, preserving a deactivated-but-assigned row when editing.
- Non-destructive migration: every existing package's free-text value lands on a valid FK; no value lost.
- Search read path keeps exposing airline / city **names** (result cards, share text unchanged).

**Non-Goals:**
- No provider or product-type scoping — these are tenant-global (unlike categories).
- No change to the search *filter UX* beyond keeping it functional (dropdown-izing filters was the separate archived search-filters change).
- No pricing, itinerary, or hotel/inclusions change (those are batch #4 / #5).
- FKs stay **nullable** at the DB level; "required" is enforced only at publish (matching today's behavior).

## Decisions

**D1 — Two separate master tables, tenant-global.**
`airlines` and `departure_cities`, each `= { id, ...tenantOwned(), name varchar(120), isActive boolean default true, ...timestamps }`, with a `uniqueIndex` on `(tenantId, lower(btrim(name)))` mirroring the providers/categories normalized-name idiom. Rationale: airlines and cities are not provider-specific; one row per real-world entity per tenant. Alternative (single polymorphic `reference_data` table with a `kind` column) rejected — weaker typing, awkward FKs, no real reuse win for two small tables.

**D2 — Package references via nullable FK, drop the varchars.**
Add `airlineId` / `departureCityId` (`ulidRef`, nullable) to `packages`; drop `airline` and `departure_city`. Name is read via join in the package and search read paths. Rationale: DRY / rename-safe, consistent with `categoryId`. Unlike `categoryId` these stay **nullable** in the DB (no `NOT NULL` cutover) because a draft package may legitimately have neither yet; publish validation enforces presence. Alternative (store the name string) rejected in clarification — denormalized, rename-unsafe.

**D3 — `isActive` retire flag; delete guarded.**
Only `isActive` rows populate the form dropdown; a package's currently-assigned row is always included in its own edit view even if deactivated (union the assigned id into the options). Hard delete is blocked when any package references the row (409) — retire via `isActive` instead. Rationale: mirrors change #1's provider active-filtering and #3's in-use delete guard.

**D4 — Migration: additive DDL, then seed + backfill, then drop.**
One migration file: (a) create both tables and add the two nullable FK columns (from `db:generate`); (b) hand-added data step — for each tenant, upsert starter master rows AND upsert one row per distinct existing free-text value (case-insensitive, so unmatched hand-typed values are preserved), then `UPDATE packages` to set each FK by normalized-name match within the same tenant; (c) drop the `airline` and `departure_city` columns. Rationale: no package orphaned, dropdowns usable immediately, no data loss. The seed script (`seed.ts`) is updated to insert starter rows and reference them by id on the demo package.

**D5 — CRUD surfaced under Settings.**
New `airlines` and `departure-cities` Nest modules (service / controller / policy), admin-guarded and tenant-scoped, mirroring `categories`. Web admin UI as two sections under `/dashboard/settings` (alongside Templates), each with TanStack Query hooks (`use-airlines`, `use-departure-cities`), query keys `[resource, params]`, mutations invalidating the resource root.

## Risks / Trade-offs

- **Backfill produces a long tail of one-off master rows** from inconsistent legacy free-text → acceptable and intended (no data loss); admins can retire/merge duplicates afterward. Mitigation: case-insensitive normalized match collapses pure case/whitespace variants.
- **Migration correctness on live data** → the FK stays nullable so there is no hard `NOT NULL` gate to fail; still, dry-run against a seeded DB and assert every previously-non-null value maps to a row before dropping the old columns.
- **Search response shape must stay stable** (result cards expect airline/city names) → keep the DTO fields as names via join; only the persistence source changes.
- **Two new modules + web sections** widen the diff → contained by copying the `categories` module and a settings section verbatim in structure.

## Migration Plan

1. Add `airlines` + `departure_cities` tables and nullable `airline_id` / `departure_city_id` FKs on `packages` (generated DDL).
2. Data step (same migration): seed starter rows + upsert rows for existing distinct values per tenant; set the FKs by normalized-name match.
3. Drop `airline` and `departure_city` columns after the update step.
4. Rollback: before the drop, removing the FK columns and the two tables restores the free-text path. After the drop, roll back by re-adding the varchar columns and copying `airlines.name` / `departure_cities.name` back via the FKs.

## Open Questions

- None blocking. Starter seed list content (exact airlines/cities) is a fill-in detail confirmed at build time, not a design decision.
```

## openspec/changes/airline-departure-city-master-data/tasks.md

- Source: openspec/changes/airline-departure-city-master-data/tasks.md
- Lines: 1-38
- SHA256: be6759bb3246ae3f9ade10d3880b04743f037ae1bb9b1207d127411652fb7208

```md
## 1. Shared contracts (`packages/shared`)

- [ ] 1.1 Add `AirlineDto` and `DepartureCityDto` interfaces (`id`, `name`, `isActive`) and create/update request Zod schemas (name required, trimmed, max 120) in a new `master-data.ts` (exported from the package index).
- [ ] 1.2 Update package create/update schemas to replace `airline` / `departureCity` free-text with nullable `airlineId` / `departureCityId` (length-26 ULID), and update the publish schema to require both ids.
- [ ] 1.3 Update `PackageDto` (and any package read type) to carry `airlineId` / `departureCityId` plus resolved `airlineName` / `departureCityName`; keep the search DTO exposing the airline name.

## 2. Database (`packages/db`)

- [ ] 2.1 Add `airlines` and `departure_cities` tables (`ulidPk`, `tenantOwned()`, `name`, `isActive` default true, `timestamps`) each with a `uniqueIndex` on `(tenantId, lower(btrim(name)))`; export inferred row types.
- [ ] 2.2 Add nullable `airlineId` / `departureCityId` `ulidRef` FKs on `packages`; run `db:generate` for the additive DDL migration.
- [ ] 2.3 Hand-add the backfill step to the generated migration: per tenant, upsert one master row per distinct non-blank existing free-text value (case-insensitive; deterministic id like `0016`), then `UPDATE packages` to set the FKs by normalized-name match; blank/null values leave a null FK. No starter list injected for real tenants.
- [ ] 2.4 Add the cutover to the same migration: drop the `airline` and `departure_city` columns after the update step; apply with `db:migrate` and confirm it runs clean.
- [ ] 2.5 Update `seed.ts` to insert the curated starter airlines/departure cities for the demo tenant only and reference them by id on the demo package; run `db:migrate` then `db:seed`.

## 3. API — master-data modules (`apps/api`)

- [ ] 3.1 Create the `airlines` module (service / controller / policy) mirroring `categories`: admin-guarded, tenant-scoped CRUD with normalized-name conflict handling and `isActive` toggle; register in `app.module.ts`.
- [ ] 3.2 Create the `departure-cities` module the same way; register it.
- [ ] 3.3 Add the delete guard: block hard-delete when any package references the row (`ConflictException`), for both modules.
- [ ] 3.4 Unit specs for both policies (normalization, ownership, delete-guard decision) — DB-free.

## 4. API — package & search integration (`apps/api`)

- [ ] 4.1 Update the packages service/mappers to persist `airlineId` / `departureCityId`, validate tenant ownership on set, enforce both at publish, and resolve names via join for the DTO.
- [ ] 4.2 Update the search service query to join `airlines` / `departure_cities`, filter by joined name, and return the airline name on results.
- [ ] 4.3 Integration spec: create → assign airline/city → publish gating; plus one search-by-airline-name spec.

## 5. Web — admin UI & form (`apps/web`)

- [ ] 5.1 Add TanStack Query hooks `use-airlines` / `use-departure-cities` (query keys `[resource, params]`, mutations invalidate the resource root) via the shared `api` instance.
- [ ] 5.2 Add two admin-only master-data sections under `/dashboard/settings` (alongside Templates): list + create/edit + activate/deactivate, with `readApiError` handling and `role="alert"` errors.
- [ ] 5.3 Replace the create-package form's airline and departure-city text inputs with dropdowns sourced from active rows, unioning in a currently-assigned deactivated row when editing; submit ids.
- [ ] 5.4 Update the search filter + result card to read the airline/departure-city names from the DTO (no free-text field).

## 6. Verify

- [ ] 6.1 Run `bun run verify` (typecheck + lint + unit) and `bun run test:int`; confirm all green.
- [ ] 6.2 Manually exercise: seed data present, admin CRUD + deactivate, form dropdowns with keep-assigned behavior, publish gating, search by airline — per the acceptance scenarios.
```

## openspec/changes/airline-departure-city-master-data/specs/airline-departure-city-master-data/spec.md

- Source: openspec/changes/airline-departure-city-master-data/specs/airline-departure-city-master-data/spec.md
- Lines: 1-52
- SHA256: 4ebe7472266801cc3942de7f1c6934644b2afbfc4998a1e85f66512266160982

```md
## ADDED Requirements

### Requirement: Tenant-global airline and departure-city master data
The system SHALL provide two tenant-scoped master tables, `airlines` and `departure_cities`, each row having a `name` and an `isActive` flag (default true). Names SHALL be unique per tenant on the normalized form (`lower(btrim(name))`), independent of Provider and product type. These tables are the single source of truth for the airline and departure city a Package references.

#### Scenario: Create airline master row
- **WHEN** an admin creates an airline with a name not already used (normalized) in the tenant
- **THEN** the row is saved as active and becomes available for selection

#### Scenario: Duplicate name rejected
- **WHEN** an admin creates an airline or departure city whose normalized name already exists in the tenant
- **THEN** the request is rejected with a field-level conflict error

### Requirement: Admin-only management under Settings
Creating, editing, activating, and deactivating airline and departure-city master rows SHALL be restricted to admin users and surfaced under Settings. Non-admin users SHALL NOT be able to mutate master data.

#### Scenario: Non-admin cannot mutate
- **WHEN** a non-admin user attempts to create or edit an airline or departure city
- **THEN** the request is rejected with a forbidden error

### Requirement: Active filtering with assigned-row preservation
Only `isActive` master rows SHALL populate the create-package form's airline and departure-city dropdowns. When editing a package whose currently-assigned airline or departure city has since been deactivated, that assigned row SHALL still be shown as the selected option so the package's value is not silently lost.

#### Scenario: Deactivated row hidden from new selections
- **WHEN** an admin deactivates an airline and then creates a new package
- **THEN** the deactivated airline is absent from the airline dropdown

#### Scenario: Assigned deactivated row preserved on edit
- **WHEN** an admin edits a package whose assigned airline was deactivated after assignment
- **THEN** the form still shows that airline as selected and the package keeps it unless changed

### Requirement: Deletion guarded for in-use rows
A master row referenced by any package SHALL NOT be hard-deletable; the delete attempt SHALL be rejected and the admin directed to deactivate instead. Unreferenced rows MAY be deleted.

#### Scenario: Delete blocked when referenced
- **WHEN** an admin deletes an airline referenced by at least one package
- **THEN** the delete is rejected with an explanatory error and the row is retained

### Requirement: Starter seed and one-time backfill of existing values
The change SHALL migrate **every tenant's** existing package free-text `airline` / `departureCity` values onto master rows — for each distinct non-blank value, matching an existing row case-insensitively (on `lower(btrim(name))`) or creating a new master row so no value is lost — then repoint each package to the corresponding foreign key. A blank or null free-text value SHALL leave the package's foreign key null and create no master row. A curated **starter set** of airlines and departure cities SHALL be seeded only for the demo/dev tenant (via the seed script); real tenants begin with only their backfilled values and curate the rest through the admin UI.

#### Scenario: Existing value backfilled without loss
- **WHEN** the migration runs against a package whose free-text airline does not match any existing master row
- **THEN** a master airline row is created from that value and the package references it

#### Scenario: Blank value leaves null reference
- **WHEN** the migration runs against a package whose free-text airline is blank or null
- **THEN** no master row is created for it and the package's `airlineId` stays null

#### Scenario: Case and whitespace variants collapse
- **WHEN** two packages have airline values differing only by letter case or surrounding whitespace
- **THEN** both are backfilled onto the same single master row
```

## openspec/changes/airline-departure-city-master-data/specs/package-catalog/spec.md

- Source: openspec/changes/airline-departure-city-master-data/specs/package-catalog/spec.md
- Lines: 1-47
- SHA256: ad3dd309ddfd04a91dc3cba4c41a059eebb8fa008a7232008676640a58e44fbe

```md
## MODIFIED Requirements

### Requirement: Package entity with structured fields
The system SHALL provide tenant-scoped CRUD for Packages with: provider ref, `productType` (`umrah`|`haji_khusus`|`haji_furoda`), `title`, per-tenant unique `slug`, `categoryId` (a **nullable** reference to an admin-defined Package Category scoped to the package's Provider and `productType`; required at publish per the Publish validation requirement), `plusDestination` (nullable), `durationDays`, `description`, inclusions/exclusions tags, flyer images, structured hotel fields stored in a one-to-many list by city (`cityName`, `name`, `stars`, `distanceM` (nullable), `isPelataran` (boolean)), `airlineId` (a **nullable** reference to a tenant Airline master row; required at publish), `flightRoute`, `departureCityId` (a **nullable** reference to a tenant Departure City master row; required at publish), `isFeatured`, `status` (`draft`|`published`|`archived`). The former fixed `category` enum is REPLACED by the `categoryId` reference. The former free-text `airline` and `departureCity` columns are REPLACED by the `airlineId` and `departureCityId` references. Duration, category, airline, departure city, and hotel fields SHALL be structured (not free text). When set, an assigned category MUST belong to the package's Provider and `productType`; an assigned `airlineId` / `departureCityId` MUST belong to the package's tenant.

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

#### Scenario: Airline and departure city must belong to the tenant
- **WHEN** a package create/update sets an `airlineId` or `departureCityId` that does not belong to the package's tenant
- **THEN** the request is rejected with a field-level error

#### Scenario: Draft may have no airline or departure city
- **WHEN** an admin saves a package as a draft without an `airlineId` or `departureCityId`
- **THEN** the draft is saved and remains editable (publish will later require both)

### Requirement: Publish validation
Publishing SHALL be blocked with field-level errors unless: `durationDays`, at least one Makkah hotel, a valid `airlineId`, a valid `departureCityId`, and a valid `categoryId` (referencing a category scoped to the package's Provider and `productType`) are present, and the package's Provider is active with the license required by the `productType` (umrah → `ppiuLicenseNo`). Drafts MAY be incomplete. Only `published` packages are ever exposed publicly (consumed by later changes). Transit hotels and flyer uploads are optional.

#### Scenario: Publish blocked on missing Makkah hotel
- **WHEN** the agent publishes a package missing a Makkah hotel
- **THEN** publish is rejected with a field-level error naming the missing field

#### Scenario: Publish blocked on inactive provider
- **WHEN** the agent publishes a package whose provider is inactive
- **THEN** publish is rejected with an explanatory error

#### Scenario: Publish blocked on missing category
- **WHEN** the agent publishes a package without a `categoryId`
- **THEN** publish is rejected with a field-level error naming the missing category

#### Scenario: Publish blocked on missing airline or departure city
- **WHEN** the agent publishes a package without an `airlineId` or `departureCityId`
- **THEN** publish is rejected with a field-level error naming the missing field
```

## openspec/changes/airline-departure-city-master-data/specs/package-search/spec.md

- Source: openspec/changes/airline-departure-city-master-data/specs/package-search/spec.md
- Lines: 1-28
- SHA256: cdba82cda021f0ad810be80593f6736e0fb71056f282f69160508b529a041829

```md
## MODIFIED Requirements

### Requirement: Combined-filter search with departure semantics
The admin search SHALL combine filters — max price (quad by default, occupancy selectable), departure month/date range, duration range, category, airline, direct-only, hotel max distance (Makkah and/or Madinah), min stars, departure city, provider, seats-available-only — and SHALL return only packages having at least one departure satisfying all departure-level predicates (`open`/`almost_full`, date in range, price within budget, seats available when toggled). The category filter SHALL operate over admin-defined Package Categories by matching the category **name** (a package matches when its `categoryId` resolves to a category whose name equals the selected value), across providers, rather than the retired fixed category enum. The airline and departure-city filters SHALL operate over the Airline and Departure City master tables by matching the referenced row's **name** (a package matches when its `airlineId` / `departureCityId` resolves to a master row whose name equals the selected value), rather than the retired free-text columns; the referenced airline / departure-city name SHALL be resolved via join for the response. Direct-only filters on an explicit `packages.directOnly` boolean. The max-price predicate compares against the selected occupancy's price, falling back to `priceQuad` when that occupancy's price is null. All queries are tenant-scoped. The admin search screen surfaces all of these filter controls.

#### Scenario: PRD acceptance filter combination
- **WHEN** the agent searches with duration = 9 days, September departures, max price 30,000,000 quad
- **THEN** results contain only packages with `durationDays = 9` having ≥1 open September departure with `priceQuad ≤ 30,000,000`

#### Scenario: Seats-available-only toggle
- **WHEN** the toggle is on and a package's only matching departure has `seatAvailable = 0`
- **THEN** that package is excluded from results

#### Scenario: Direct-only filter
- **WHEN** the agent enables the direct-only filter
- **THEN** results contain only packages with `directOnly = true`

#### Scenario: Occupancy price fallback
- **WHEN** the max-price filter selects triple occupancy and a matching departure has `priceTriple = null`
- **THEN** the price predicate for that departure compares the max price against `priceQuad`

#### Scenario: Category filter over admin-defined categories
- **WHEN** the agent filters by a category name
- **THEN** results contain only packages whose `categoryId` resolves to a category with that name

#### Scenario: Airline filter over master data
- **WHEN** the agent filters by an airline name
- **THEN** results contain only packages whose `airlineId` resolves to an airline master row with that name, and each result card shows that airline name
```

