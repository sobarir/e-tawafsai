# Comet Design Handoff

- Change: hotel-master-catalog
- Phase: design
- Mode: compact
- Context hash: 40f9be0daba8fbe19c539e3488a798c6a07b1bc24efbd87a035ce73ff360fb4f

Generated-by: comet-handoff.sh

OpenSpec remains the canonical capability spec. This handoff is a deterministic, source-traceable context pack, not an agent-authored summary.

## openspec/changes/hotel-master-catalog/proposal.md

- Source: openspec/changes/hotel-master-catalog/proposal.md
- Lines: 1-63
- SHA256: e2a824f3d9435ad307c8bdcd420c31c31c84fd026f4561ecb14565d0be8655ce

```md
## Why

Today a package's hotels are typed as free text on every package (`package_hotels`
holds `cityName`, `name`, `stars`, `distanceM`, `isPelataran` per row), so the same
physical hotel is re-entered — and mistyped — for each package, with no reuse or
consistency. This is change #4 of the create-package-form revamp, and it finishes the
master-data pattern already applied to airlines, departure cities, and categories:
hotels become an admin-managed catalog that packages reference instead of retype.

## What Changes

- Introduce a tenant-global **hotel catalog** (`hotels`): `name`, `city` (free text
  so Makkah, Madinah, and transit/plus cities all work), `stars`, `distanceM`
  (nullable), `isPelataran`, `isActive`. Uniqueness is per `(tenant, lower(name),
  lower(city))` so the same hotel name may exist in two cities.
- **BREAKING (data model):** the hotel attribute columns move OFF `package_hotels`
  onto the catalog. `package_hotels` becomes a pure link `{ packageId, hotelId }`
  with a unique `(packageId, hotelId)` to block duplicates. The `cityName`, `name`,
  `stars`, `distanceM`, `isPelataran` columns are dropped from `package_hotels`.
- **Admin CRUD** for the catalog mirroring airlines/departure-cities: create, edit
  attributes, `isActive` toggle, delete-behind-confirm, and keep-assigned (a
  deactivated hotel still shows when a package already uses it). Because a hotel has
  more than `{name, isActive}`, it needs a richer admin form than the simple
  `MasterList`.
- **Form:** the "Add Hotel" section stops taking free-text fields; the admin picks a
  city, then selects an active catalog hotel for that city and attaches it. Attach
  posts `{ hotelId }` instead of full hotel fields. Multiple hotels per package
  (Makkah + Madinah + transit) still allowed.
- **BREAKING (API):** `POST /packages/:id/hotels` body changes from the full hotel
  shape to `{ hotelId }`; `HotelInput` in shared changes accordingly. New
  `/hotels` CRUD endpoints + Zod schemas are added to shared.
- **Migration (fresh start):** existing `package_hotels` rows are cleared (no
  backfill), columns dropped, `hotelId` added NOT NULL; demo seed adds a few catalog
  hotels and demo package↔hotel links so seeded packages still publish.

## Capabilities

### New Capabilities
- `hotel-master-catalog`: tenant-global hotel catalog with admin CRUD (create,
  edit-attributes, isActive toggle, delete-with-confirm, keep-assigned) and the
  in-form city-filtered hotel picker; `package_hotels` as a link to the catalog.

### Modified Capabilities
- `package-catalog`: the package's hotel fields are REPLACED by a `hotelId` reference
  to a Hotel catalog row (of the package's tenant); the publish rule "at least one
  Makkah hotel" is evaluated against the referenced catalog hotel's `city`.

## Impact

- **DB (`packages/db`):** new `hotels` table; `package_hotels` reshaped to
  `{ packageId, hotelId }`; migration (drop columns, add FK, clear rows); demo seed.
- **Shared (`packages/shared`):** `HotelInput` → `{ hotelId }`; new hotel Zod
  schemas + DTO/types; `PackageDto.hotels` gains each attached hotel's `city` so the
  publish rule and search can read it.
- **API (`apps/api`):** new `hotels` module (controller/service/policy) modeled on
  `airlines`; `packages.service` hotel attach + DTO mapping join through the catalog;
  `packages.policy` Makkah-hotel check reads catalog `city`; `search` service
  re-joins `package_hotels → hotels` (keeping DTO field names `cityName`, `name`,
  `stars`, `distanceM`).
- **Web (`apps/web`):** hotel-catalog admin UI + TanStack Query hooks
  (`use-hotels`); package form hotel section becomes a catalog picker.
- **Non-goals:** no hotel photos/geo/amenities; no per-package attribute overrides;
  no change to airline/city/category masters; #5 inclusions/exclusions untouched.
```

## openspec/changes/hotel-master-catalog/design.md

- Source: openspec/changes/hotel-master-catalog/design.md
- Lines: 1-116
- SHA256: be427039a27d74b01445f57771e17a615afc20481073267c884737e0c241b324

[TRUNCATED]

```md
## Context

Hotels are currently entered as free text per package: `package_hotels` rows hold
`cityName`, `name`, `stars`, `distanceM`, `isPelataran`, keyed only by `packageId`
(cascade). The same physical hotel is retyped for every package, with drift and typos
and no reuse. This is change #4 of the create-package-form revamp; #2
(airline/departure-city) and #3 (provider-category-commission) already established the
tenant-scoped master-table + admin-CRUD + form-dropdown + keep-assigned idiom. This
change applies that idiom to hotels — but a hotel carries **attributes** (city, stars,
distance, pelataran), unlike the `{name, isActive}` airline/city rows, so the model and
admin UI are richer.

Dependency direction stays `shared ← db ← api`, `shared ← web` (AGENTS.md DRY rules).
Wire shapes live in `packages/shared`, columns in `packages/db`.

## Goals / Non-Goals

**Goals:**
- A tenant-global `hotels` catalog with full attributes and `isActive`, admin-managed.
- `package_hotels` reduced to a pure link `{ packageId, hotelId }` (full normalization).
- In-form city-filtered picker replacing free-text hotel entry; keep-assigned on edit.
- Publish rule "≥1 Makkah hotel" and package-search hotel surfacing keep working,
  now reading the catalog.

**Non-Goals:**
- Hotel photos, geo-coordinates, amenities, or per-package attribute overrides.
- Backfilling existing free-text `package_hotels` data (explicit fresh start).
- Any change to airline/city/category masters or #5 inclusions/exclusions.

## Decisions

### D1: Full normalization — attributes on the catalog, `package_hotels` is a pure link
`hotels = { id, tenantId, name, city, stars, distanceM?, isPelataran, isActive, ts }`;
`package_hotels = { packageId → packages(cascade), hotelId → hotels }` with a unique
`(packageId, hotelId)`. Stars, distance-to-Haram, pelataran and city are intrinsic to a
physical hotel, not to a package's use of it, so they belong on the catalog — mirroring
#3 moving commission onto the category. *Alternative considered:* keep a per-package
snapshot plus a nullable `hotelId` (softer, no destructive migration) — rejected because
it permits attribute drift and duplicates the shape, violating "one concern, one place."

### D2: `city` as free-text varchar(120), uniqueness on `(tenant, lower(name), lower(city))`
Today's form allows Makkah, Madinah, **and** the package's `plusDestination` (transit)
as a hotel city; an enum would drop transit support. Free text keeps it. Uniqueness is on
the normalized name+city pair (not name alone) so "Hilton" can exist in both Makkah and
Madinah. Normalized-name idiom `lower(btrim(...))` matches airlines/cities/categories.
*Alternative:* enum(Makkah, Madinah) — rejected, loses transit hotels.

### D3: Attach API becomes `{ hotelId }`; new `hotels` CRUD module modeled on `airlines`
`POST /packages/:id/hotels` body changes from the full hotel shape to `{ hotelId }`
(BREAKING). New `HotelsModule` (controller/service/policy) mirrors `airlines`:
tenant-scoped list/create/update/delete, admin-guarded (`JwtAuthGuard`, `RolesGuard`,
`@Roles("admin")`), `noun.verb` structured logging, `ConflictException` on duplicate,
delete blocked when referenced. `HotelInput` in shared becomes `{ hotelId: string }`;
new `createHotelSchema` / `updateHotelSchema` (Zod) + `HotelDto`.

### D4: DTO keeps `cityName`; typed mapper joins the catalog
`PackageDto.hotels[]` keeps its existing field names (`cityName`, `name`, `stars`,
`distanceM`) plus adds `isPelataran`, sourced by joining `package_hotels → hotels` and
mapping `hotel.city → cityName`. This preserves the `package-search` DTO contract and
the publish policy (`pkg.hotels.some(h => h.cityName === "Makkah")`) with zero churn in
those consumers' shapes. Mapping lives in a typed mapper (`toHotelDto`) per DRY rule #4.

### D5: Search re-joins through the catalog
`search.ts` builds a hotels lateral (`json_agg`) and a hotel-name `EXISTS` + `hotelCity`
filter correlated on `package_id`. These re-join `package_hotels → hotels` and read
`hotels.city` / `hotels.name` / `hotels.stars` / `hotels.distance_m`. Behavior and DTO
output are unchanged; only the source columns move. Add an index on
`package_hotels(hotel_id)` (Postgres does not auto-index FK columns) alongside the
existing `package_id` index.

### D6: Admin UI — richer form, not the `MasterList`
The simple `MasterList` (name + isActive) can't hold city/stars/distance/pelataran.
Add a dedicated hotel admin section with a richer create/edit form (name, city, stars,
distance, pelataran, active) reusing the confirm-on-delete and keep-assigned patterns.
Placement: a **Hotels** section on the existing master-data page (retitle from "Airlines
& Departure Cities") — keeps master data in one place. `use-hotels` TanStack Query hooks
with query keys `["hotels", params]`, mutations invalidate the resource root.

### D7: Form picker
The "Add Hotel" card drops its free-text inputs. Admin picks a city (Makkah / Madinah /
```

Full source: openspec/changes/hotel-master-catalog/design.md

## openspec/changes/hotel-master-catalog/tasks.md

- Source: openspec/changes/hotel-master-catalog/tasks.md
- Lines: 1-41
- SHA256: a294af75941277258640eda31f40b2ebc9f09b38be5036c9ae0babf8ba75f5b3

```md
## 1. Shared contracts (`packages/shared`)

- [ ] 1.1 Add `createHotelSchema` / `updateHotelSchema` (Zod: `name`, `city`, `stars` 1–5, `distanceM` nullable, `isPelataran`, `isActive`) and export inferred input types
- [ ] 1.2 Add `HotelDto` (`id, name, city, stars, distanceM, isPelataran, isActive`) and change `HotelInput` to `{ hotelId: string }`
- [ ] 1.3 Extend `PackageDto.hotels[]` to include `hotelId` and `isPelataran` (keep `cityName`, `name`, `stars`, `distanceM`); update `search.ts` DTO type to match

## 2. DB schema, migration & seed (`packages/db`)

- [ ] 2.1 Add `hotels` table (tenant-owned; `name`, `city`, `stars`, `distanceM?`, `isPelataran`, `isActive`) with unique index on `(tenantId, lower(btrim(name)), lower(btrim(city)))`; export `DbHotel`/`NewDbHotel`
- [ ] 2.2 Reshape `packageHotels` to `{ packageId (cascade), hotelId → hotels }` with unique `(packageId, hotelId)` and an index on `hotel_id`; drop `cityName`, `name`, `stars`, `distanceM`, `isPelataran`
- [ ] 2.3 `db:generate` the migration (create `hotels`, truncate `package_hotels`, drop columns, add FK/unique/index); review the generated SQL
- [ ] 2.4 Update the seed to insert demo catalog hotels and link Makkah + Madinah hotels to demo packages; `db:migrate` then `db:seed` and confirm seeded packages still publish

## 3. API — hotels catalog module (`apps/api/src/hotels`)

- [ ] 3.1 Scaffold `HotelsModule` (controller/service/policy) modeled on `airlines`: tenant-scoped list/create/update/delete, `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles("admin")`, structured `hotel.*` logging
- [ ] 3.2 Enforce normalized name+city uniqueness (`ConflictException`) and block delete when referenced by any package (explanatory error); register module in `app.module.ts`
- [ ] 3.3 Unit specs: hotels policy/service boundary (duplicate rejected, delete-when-referenced blocked, non-admin forbidden)
- [ ] 3.4 Integration spec: hotels CRUD against Postgres, cleaning up its own rows

## 4. API — wire packages, search & publish policy

- [ ] 4.1 Change `addHotel` to accept `{ hotelId }` (validate tenant ownership, insert link, reject cross-tenant + duplicate); add `DELETE /packages/:id/hotels/:hotelId` detach that removes only the link
- [ ] 4.2 Update `toHotelDto` / package DTO mapping to join `package_hotels → hotels` and map `hotel.city → cityName` (+ `isPelataran`)
- [ ] 4.3 Update `search` service hotels lateral (`json_agg`) and hotel-name `EXISTS` / `hotelCity` filters to join through `hotels`; confirm DTO output unchanged
- [ ] 4.4 Confirm publish policy "≥1 Makkah hotel" reads the joined `cityName`; update/extend `packages.policy.spec` and `packages.service.int.spec` for the new attach shape

## 5. Web — hotel catalog admin (`apps/web`)

- [ ] 5.1 Add `use-hotels` TanStack Query hooks (keys `["hotels", params]`; mutations invalidate the resource root) over the shared `api` instance
- [ ] 5.2 Add a Hotels admin section to the master-data page (retitle the header): richer create/edit form (name; city = canonical Makkah/Madinah select + transit/other free-text escape; stars; distance; pelataran; active), `isActive` toggle, delete behind `useConfirm`, admin-gated

## 6. Web — package form hotel picker (`apps/web/.../packages/[id]`)

- [ ] 6.1 Replace the free-text "Add Hotel" inputs with a city select → active-catalog-hotel dropdown (keep-assigned includes an attached-but-deactivated hotel); attach by `hotelId`
- [ ] 6.2 Prevent duplicate attach client-side (filter already-attached hotels by `hotelId`); render attached hotels from the DTO (name, stars, distance/pelataran) each with a detach button gated by `useConfirm`

## 7. Verify

- [ ] 7.1 `bun run verify` passes (typecheck + lint + test); `bun run test:int` passes locally
- [ ] 7.2 Manual smoke: create a hotel → appears in form picker → attach → package DTO & search show it → deactivate hides it from picker but keeps it on the using package → delete blocked while referenced
```

## openspec/changes/hotel-master-catalog/specs/hotel-master-catalog/spec.md

- Source: openspec/changes/hotel-master-catalog/specs/hotel-master-catalog/spec.md
- Lines: 1-87
- SHA256: 2474f711b253bfd91252770a468c061ac4279ab9b098b5a7a5ba7d30f9ab09d4

[TRUNCATED]

```md
## ADDED Requirements

### Requirement: Tenant-global hotel catalog
The system SHALL provide a tenant-scoped `hotels` master table, each row having a `name`, a `city` (free text so Makkah, Madinah, and transit/plus-destination cities are all expressible), `stars` (1–5), `distanceM` (nullable, meters to the Haram), `isPelataran` (boolean), and an `isActive` flag (default true). A hotel SHALL be unique per tenant on the normalized `(lower(btrim(name)), lower(btrim(city)))` pair, so the same hotel name MAY exist in more than one city. This table is the single source of truth for the hotels a Package references.

#### Scenario: Create catalog hotel
- **WHEN** an admin creates a hotel with a name+city pair not already used (normalized) in the tenant
- **THEN** the row is saved as active and becomes available for selection

#### Scenario: Duplicate name+city rejected
- **WHEN** an admin creates a hotel whose normalized name and city already exist together in the tenant
- **THEN** the request is rejected with a field-level conflict error

#### Scenario: Same name allowed across cities
- **WHEN** an admin creates a hotel with a name that already exists in the tenant but for a different city
- **THEN** the row is saved (the uniqueness is on name+city, not name alone)

### Requirement: Admin-only catalog management under Settings
Creating, editing, activating, deactivating, and deleting hotel catalog rows SHALL be restricted to admin users and surfaced under Settings. Because a hotel carries more than a name, the admin form SHALL edit `name`, `city`, `stars`, `distanceM`, and `isPelataran` (not just a name field). The city input SHALL offer the canonical cities Makkah and Madinah as selectable options plus a transit/other escape that accepts a free-text city, so canonical city names are entered consistently (keeping the publish "Makkah hotel" check and the picker's city filter reliable) while transit cities remain expressible. Non-admin users SHALL NOT be able to mutate the catalog.

#### Scenario: Non-admin cannot mutate
- **WHEN** a non-admin user attempts to create or edit a catalog hotel
- **THEN** the request is rejected with a forbidden error

#### Scenario: Admin edits hotel attributes
- **WHEN** an admin edits a catalog hotel's stars or distance
- **THEN** the updated attributes are persisted and reflected wherever the hotel is referenced

#### Scenario: Canonical city entered consistently
- **WHEN** an admin creates a Makkah hotel via the canonical city option
- **THEN** the stored `city` is exactly "Makkah" so the hotel is offered in the Makkah picker and counts toward the publish Makkah-hotel rule

#### Scenario: Transit city via escape
- **WHEN** an admin chooses the transit/other option and enters a free-text city
- **THEN** the hotel is stored with that city and offered in the picker for a package whose plus-destination matches it

### Requirement: Active filtering with assigned-hotel preservation
In the package form's hotel picker, only `isActive` catalog hotels of the chosen city (tenant-scoped) SHALL be offered. When editing a package whose attached hotel has since been deactivated, that hotel SHALL still be shown as attached so the package's value is not silently lost.

#### Scenario: Deactivated hotel hidden from picker
- **WHEN** an admin deactivates a hotel and then opens the package form's picker for that city
- **THEN** the deactivated hotel is absent from the pick list

#### Scenario: Attached deactivated hotel preserved on edit
- **WHEN** an admin edits a package whose attached hotel was deactivated after attachment
- **THEN** the form still shows that hotel as attached and the package keeps it unless detached

### Requirement: Package-hotel link to the catalog
A Package's hotels SHALL be stored as links `{ packageId, hotelId }` to catalog rows, with no per-package hotel attributes. A package SHALL NOT attach the same hotel twice (unique `(packageId, hotelId)`). Attaching a hotel SHALL reference an existing catalog hotel of the package's tenant by `hotelId`; detaching SHALL remove only the link, never the catalog row. The Package DTO's hotel list SHALL expose each attached hotel's `hotelId` alongside its catalog attributes (`cityName` mapped from the catalog `city`, `name`, `stars`, `distanceM`, `isPelataran`) so a client can render, deduplicate the picker against, and detach a specific attachment.

#### Scenario: Attach a catalog hotel
- **WHEN** an admin attaches a hotel to a package by `hotelId`
- **THEN** a link row is created and the package's hotel list includes the catalog hotel's `hotelId` and attributes

#### Scenario: Duplicate attach rejected
- **WHEN** an admin attaches a hotel already attached to the same package
- **THEN** the request is rejected and no second link is created

#### Scenario: Cross-tenant hotel rejected
- **WHEN** an admin attaches a `hotelId` that belongs to another tenant
- **THEN** the request is rejected with a field-level error

#### Scenario: Detach keeps the catalog row
- **WHEN** an admin detaches a hotel from a package
- **THEN** the link is removed and the catalog hotel remains available for other packages

### Requirement: Deletion guarded for in-use hotels
A catalog hotel referenced by any package SHALL NOT be hard-deletable; the delete attempt SHALL be rejected and the admin directed to deactivate instead. Unreferenced hotels MAY be deleted, gated behind the shared confirm dialog.

#### Scenario: Delete blocked when referenced
- **WHEN** an admin deletes a hotel referenced by at least one package
- **THEN** the delete is rejected with an explanatory error and the row is retained

#### Scenario: Unreferenced hotel deletable behind confirm
- **WHEN** an admin confirms deletion of a hotel referenced by no package
- **THEN** the row is removed

### Requirement: Fresh-start migration and demo seed
The change SHALL reshape `package_hotels` into a link table `{ packageId, hotelId }`, dropping the per-package hotel attribute columns (`cityName`, `name`, `stars`, `distanceM`, `isPelataran`). Existing `package_hotels` rows SHALL be cleared without backfill. A demo seed SHALL add a curated set of catalog hotels for the demo/dev tenant and link them to seeded packages so those packages still satisfy publish validation. Real tenants begin with an empty catalog curated through the admin UI.

```

Full source: openspec/changes/hotel-master-catalog/specs/hotel-master-catalog/spec.md

## openspec/changes/hotel-master-catalog/specs/package-catalog/spec.md

- Source: openspec/changes/hotel-master-catalog/specs/package-catalog/spec.md
- Lines: 1-32
- SHA256: 8ce0fe4e84e81a4d160d1a950ad597eede6acefaf700290e89816e32938a7121

```md
## MODIFIED Requirements

### Requirement: Package entity with structured fields
The system SHALL provide tenant-scoped CRUD for Packages with: provider ref, `productType` (`umrah`|`haji_khusus`|`haji_furoda`), `title`, per-tenant unique `slug`, `categoryId` (a **nullable** reference to an admin-defined Package Category scoped to the package's Provider and `productType`; required at publish per the Publish validation requirement), `plusDestination` (nullable), `durationDays`, `description`, inclusions/exclusions tags, flyer images, a one-to-many list of hotels stored as links (`hotelId`) to rows in the tenant **Hotel catalog** (each catalog hotel carrying `city`, `name`, `stars`, `distanceM` (nullable), `isPelataran`); a package SHALL NOT reference the same hotel twice, `airlineId` (a **nullable** reference to a tenant Airline master row; required at publish), `flightRoute`, `departureCityId` (a **nullable** reference to a tenant Departure City master row; required at publish), `isFeatured`, `status` (`draft`|`published`|`archived`). The former fixed `category` enum is REPLACED by the `categoryId` reference. The former free-text `airline` and `departureCity` columns are REPLACED by the `airlineId` and `departureCityId` references. The former per-package free-text hotel fields (`cityName`, `name`, `stars`, `distanceM`, `isPelataran`) are REPLACED by the `hotelId` reference to the Hotel catalog. Duration, category, airline, departure city, and hotels SHALL be structured (not free text). When set, an assigned category MUST belong to the package's Provider and `productType`; an assigned `airlineId` / `departureCityId` MUST belong to the package's tenant; an attached `hotelId` MUST belong to the package's tenant.

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

#### Scenario: Attached hotel must belong to the tenant
- **WHEN** a package attaches a `hotelId` that does not belong to the package's tenant
- **THEN** the request is rejected with a field-level error
```

