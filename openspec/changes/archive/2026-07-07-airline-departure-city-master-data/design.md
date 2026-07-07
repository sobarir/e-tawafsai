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
