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
