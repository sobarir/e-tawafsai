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
`plusDestination`), then selects from a dropdown of active catalog hotels for that city
(keep-assigned includes an attached-but-deactivated hotel), and attaches by `hotelId`.
Duplicate attach is prevented client- and server-side.

## Risks / Trade-offs

- **Destructive migration (drops columns, clears rows)** → Explicitly chosen fresh
  start; guarded by demo seed re-linking Makkah hotels so seeded packages stay
  publishable. Real tenants start empty and curate via admin UI. Irreversible on the
  data side — acceptable for pre-production.
- **`hotelId` NOT NULL on a table whose rows are cleared** → Safe: rows are truncated
  before the NOT NULL column is added, so no default-backfill conflict.
- **DTO field rename risk (`city` vs `cityName`)** → Mitigated by D4 keeping `cityName`
  in the DTO via the mapper; publish policy and search untouched at the contract level.
- **Duplicate hotel attach** → unique `(packageId, hotelId)` + server guard +
  client-side filter of already-attached hotels.
- **Cross-tenant `hotelId`** → service validates the hotel belongs to the package's
  tenant before linking (field-level error), same idiom as airline/city.

## Migration Plan

1. `db:generate` a migration that: creates `hotels`; truncates `package_hotels`; drops
   `cityName, name, stars, distanceM, isPelataran`; adds `hotelId` NOT NULL FK +
   unique `(packageId, hotelId)` + index on `hotel_id`.
2. `db:migrate` then update the seed to insert demo catalog hotels and link Makkah +
   Madinah hotels to demo packages; `db:seed`.
3. Ship shared schema/DTO, API `hotels` module + packages/search/policy updates, web
   admin + form + hooks together (contract compatibility enforced by `bun run verify`).

Rollback: revert the migration (recreate columns) — but cleared per-package hotel data
is not recoverable; acceptable pre-production.

## Open Questions

- None blocking. Admin-UI placement (shared master-data page per D6) can be revisited in
  build if the page grows unwieldy; not a spec-level concern.
