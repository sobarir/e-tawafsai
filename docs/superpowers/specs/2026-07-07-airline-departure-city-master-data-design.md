---
comet_change: airline-departure-city-master-data
role: technical-design
canonical_spec: openspec
---

# Airline & Departure City Master Data — Technical Design

Deep technical design for batch change #2 of the Create Package form revamp.
Requirements are canonical in the OpenSpec delta specs under
`openspec/changes/airline-departure-city-master-data/specs/`; this document
covers **how** to implement them, the risks, and the test strategy. It does not
restate requirements.

## Current state

`packages.airline` and `packages.departure_city` are free-text `varchar(120)`
columns (nullable in the DB, required at publish via the shared publish schema).
They are written from the create-package form, echoed back on edit, exposed on
package DTOs, and read by package search (as a filter, on the result card, and
in the WhatsApp share text). The demo seed sets `"Saudi Arabian Airlines"` /
`"Jakarta"`.

Three in-repo idioms are mirrored rather than invented:

- **`tags`** — tenant-global master (`tenantOwned()`, unique per tenant).
- **`package_categories`** (change #3, `drizzle/0016_late_venus.sql`) — the
  FK-cutover mechanism: add nullable FK, backfill inside the migration, drop the
  old column, read the name via join; plus a CRUD module (`apps/api/src/categories`).
- **`providers.isActive`** (change #1) — active-filtering of dropdown options
  while preserving a currently-assigned value on edit.

There is **no** per-tenant provisioning hook (tags are inserted on demand; #3
seeded categories inside its migration), which drives the seed-scope decision below.

## Data model

Two tenant-global tables in `packages/db/src/schema/packages.ts` (or a sibling
`master-data.ts` — colocated with packages since the FKs live there):

```
airlines            { id ulidPk, ...tenantOwned(), name varchar(120),
                      isActive boolean not null default true, ...timestamps }
departure_cities    { id ulidPk, ...tenantOwned(), name varchar(120),
                      isActive boolean not null default true, ...timestamps }
```

Each gets `uniqueIndex("<t>_tenant_name_idx").on(tenantId, lower(btrim(name)))`,
matching the providers/categories normalized-name idiom. `packages` gains nullable
`airlineId` / `departureCityId` `ulidRef` columns referencing them; the
`airline` and `departure_city` varchars are dropped.

FKs are **nullable** at the DB level (unlike #3's `categoryId`, which went
`NOT NULL`): a draft may legitimately have neither yet, and publish — not the
schema — enforces presence. This removes the count-checked `NOT NULL` cutover #3
needed.

## Migration

One migration file, authored the repo way: `db:generate` for the additive DDL,
then hand-added data + cutover SQL (see `0016` for the exact style).

1. **DDL (generated):** create both tables; add the two nullable FK columns.
2. **Backfill (hand-added), per table:**
   - `INSERT INTO airlines (id, tenant_id, name, is_active, ...) SELECT DISTINCT ON
     (tenant_id, lower(btrim(airline))) <deterministic-id>, tenant_id, btrim(airline),
     true, now(), now() FROM packages WHERE airline IS NOT NULL AND btrim(airline) <> ''
     ON CONFLICT DO NOTHING;` — id synthesized deterministically as
     `upper(substr(md5(tenant_id || lower(btrim(airline))), 1, 26))` (same trick as #3;
     satisfies the 26-char id column and is stable across reruns).
   - `UPDATE packages p SET airline_id = a.id FROM airlines a WHERE a.tenant_id = p.tenant_id
     AND lower(btrim(a.name)) = lower(btrim(p.airline)) AND p.airline IS NOT NULL
     AND btrim(p.airline) <> '';`
   - Same two statements for `departure_cities` / `departure_city` / `departure_city_id`.
3. **Cutover (hand-added):** `ALTER TABLE packages DROP COLUMN airline, DROP COLUMN departure_city;`

No starter list is injected for real tenants — the migration only preserves what
already exists. Blank/whitespace-only values are filtered out, so they end as
`NULL` FKs and create no master row.

## Seed

`packages/db/src/seed.ts` inserts a curated starter list **for the demo tenant
only** (airlines: Garuda Indonesia, Saudia, Lion Air, Citilink, Batik Air …;
cities: Jakarta, Surabaya, Medan, Makassar, Solo, Balikpapan …) and sets the demo
package's `airlineId` / `departureCityId` by id. Real tenants curate via the admin
UI. Run order stays `db:migrate` then `db:seed`.

## API

Two Nest modules, `apps/api/src/airlines` and `apps/api/src/departure-cities`,
each a near-verbatim copy of the `categories` module structure:

- **Controller** — `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles("admin")`;
  `GET` (list, tenant-scoped), `POST` (create), `PATCH :id` (edit `name`
  and/or `isActive` in one body), `DELETE :id`. Bodies validated by
  `ZodValidationPipe` with schemas from `shared`.
- **Service** — normalizes name on write (`lower(btrim)`), maps 23505 /
  precheck to `ConflictException` on duplicate normalized name; `DELETE` runs a
  referenced-by-package check and throws `ConflictException` when in use (retire
  via `isActive` instead). Logs `airline.created` / `.updated` / `.deactivated`
  style domain events. Typed `toAirlineDto` / `toDepartureCityDto` mappers.
- **Policy** (`*.policy.ts`, pure, unit-tested) — name normalization, tenant
  ownership, and the "can this row be deleted" decision given a reference count.

`packages.service.ts` maps `airlineId` / `departureCityId`, validates each set id
belongs to the package's tenant (field-level error otherwise), enforces both at
publish (extends the existing publish validation), and resolves
`airlineName` / `departureCityName` via join for the read DTO.

`search.service.ts` joins both master tables; the airline / departure-city filters
match the joined name with the same **exact-equality** semantics the free-text
columns had (dropdown-izing the filter is out of scope), and the result payload
keeps exposing the airline name.

`shared`: new `AirlineDto` / `DepartureCityDto` + create/update Zod schemas in a
`master-data.ts`; package create/update schemas swap `airline`/`departureCity`
for nullable `airlineId`/`departureCityId`; publish schema requires both ids;
package + search read DTOs carry the resolved names. No drizzle-zod (per repo DRY
rule — typed mappers keep contract↔persistence aligned).

## Web

- `use-airlines` / `use-departure-cities` TanStack Query hooks (keys
  `["airlines", params]` etc.; mutations invalidate the resource root) via the
  shared `api` ky instance; errors read through `readApiError()`.
- Two admin-only sections under `/dashboard/settings` (alongside Templates):
  list + create/edit + activate/deactivate, errors rendered `role="alert"` near
  the action.
- Create-package form: replace the airline and departure-city text inputs with
  `<select>` dropdowns sourced from **active** rows; when editing, union the
  currently-assigned row into the options even if it is inactive so the value is
  not silently dropped; submit ids.
- Search filter control + result card read the airline / city **name** from the
  DTO — no free-text field.

## Risks / trade-offs

- **Long tail of one-off master rows** from inconsistent legacy spellings →
  intended (no data loss); case/whitespace-only variants collapse via the
  normalized match; admins prune afterward.
- **Migration correctness on live data** → FK nullable means no hard gate that
  can fail mid-migration; still dry-run against a seeded DB and confirm every
  previously-non-null value resolves to a row before the `DROP COLUMN`.
- **Search response shape must stay stable** (result cards + share text expect
  names) → keep the DTO name fields; only the persistence source changes.
- **Diff breadth** (two modules + two web sections) → contained by copying the
  `categories` module and a settings section structure verbatim.

## Testing strategy

- **Unit (DB-free, in `verify`):** `airlines.policy.spec.ts` and
  `departure-cities.policy.spec.ts` — normalization, tenant ownership, and the
  delete-guard decision.
- **Integration (`test:int`):** master CRUD happy path + duplicate-name 409 +
  delete-guard 409 when referenced; package create → assign airline/city →
  publish gating (publish blocked when either id missing); search-by-airline-name
  returns the expected package with the name on the card.
- **Migration:** verified by running `db:migrate` then `db:seed` clean, and an
  integration assertion that the seeded demo package resolves its airline/city
  names post-migration.

## Spec patch applied

The delta spec requirement "Starter seed and one-time backfill of existing
values" was amended (supplement only): the starter list is seeded for the
demo/dev tenant while the migration backfills every tenant's existing values;
added boundary scenarios for blank values and case/whitespace collapse.
