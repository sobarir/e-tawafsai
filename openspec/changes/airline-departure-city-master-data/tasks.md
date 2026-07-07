## 1. Shared contracts (`packages/shared`)

- [x] 1.1 Add `AirlineDto` and `DepartureCityDto` interfaces (`id`, `name`, `isActive`) and create/update request Zod schemas (name required, trimmed, max 120) in a new `master-data.ts` (exported from the package index).
- [x] 1.2 Update package create/update schemas to replace `airline` / `departureCity` free-text with nullable `airlineId` / `departureCityId` (length-26 ULID), and update the publish schema to require both ids.
- [x] 1.3 Update `PackageDto` (and any package read type) to carry `airlineId` / `departureCityId` plus resolved `airlineName` / `departureCityName`; keep the search DTO exposing the airline name.

## 2. Database (`packages/db`)

- [x] 2.1 Add `airlines` and `departure_cities` tables (`ulidPk`, `tenantOwned()`, `name`, `isActive` default true, `timestamps`) each with a `uniqueIndex` on `(tenantId, lower(btrim(name)))`; export inferred row types.
- [x] 2.2 Add nullable `airlineId` / `departureCityId` `ulidRef` FKs on `packages`; run `db:generate` for the additive DDL migration. _(schema half done here; `db:generate` runs in Task 4)_
- [x] 2.3 Hand-add the backfill step to the generated migration: per tenant, upsert one master row per distinct non-blank existing free-text value (case-insensitive; deterministic id like `0016`), then `UPDATE packages` to set the FKs by normalized-name match; blank/null values leave a null FK. No starter list injected for real tenants. _(migration 0017, additive+backfill)_
- [x] 2.4 Add the cutover: drop `airline` / `departure_city` (migration 0018). Also drop+recreate the `search_doc` generated column, which depended on `airline` (regenerated as title+description; airline stays full-text-searchable via a query join — see Task 4.2/8). Applied clean; backfill verified (0 unbackfilled rows).
- [x] 2.5 Update `seed.ts` to insert the curated starter airlines/departure cities for the demo tenant only and reference them by id on the demo package; run `db:migrate` then `db:seed`. _Verified: 6 airlines / 6 cities, demo package linked; idempotent._

## 3. API — master-data modules (`apps/api`)

- [x] 3.1 Create the `airlines` module (service / controller / policy) mirroring `categories`: admin-guarded, tenant-scoped CRUD with normalized-name conflict handling and `isActive` toggle; register in `app.module.ts`.
- [x] 3.2 Create the `departure-cities` module the same way; register it.
- [x] 3.3 Add the delete guard: block hard-delete when any package references the row (`ConflictException`), for both modules.
- [x] 3.4 Unit specs for both policies (normalization + DTO mapping) — DB-free. _Delete-guard/ownership logic lives in the service (needs DB) and is covered by integration tests (Task 14), not extracted as a pure policy fn._

## 4. API — package & search integration (`apps/api`)

- [x] 4.1 Update the packages service/mappers to persist `airlineId` / `departureCityId`, validate tenant ownership on set, enforce both at publish, and resolve names via join for the DTO.
- [x] 4.2 Update the search service query to join `airlines` / `departure_cities`, filter by joined name, and return the airline name on results. _Also re-added airline-name matching to the full-text `q` branch (search_doc lost `airline` in migration 0018)._
- [x] 4.3 Integration spec: create → assign airline/city → publish gating; plus one search-by-airline-name spec. _Added packages publish-gating (field-error naming + resolved DTO names) and search-by-airline specs; also added `airlines`/`departure-cities` service int specs (create, dup-name conflict, delete unused, in-use delete guard) to honor the Task 3.4 deferral. 27 int tests green; typecheck clean._

## 5. Web — admin UI & form (`apps/web`)

- [x] 5.1 Add TanStack Query hooks `use-airlines` / `use-departure-cities` (query keys `[resource, params]`, mutations invalidate the resource root) via the shared `api` instance.
- [x] 5.2 Add two admin-only master-data sections under `/dashboard/settings` (alongside Templates): list + create/edit + activate/deactivate, with `readApiError` handling and `role="alert"` errors.
- [x] 5.3 Replace the create-package form's airline and departure-city text inputs with dropdowns sourced from active rows, unioning in a currently-assigned deactivated row when editing; submit ids. _Also updated packages list display + made master DTOs explicit exported interfaces (TS4058)._
- [x] 5.4 Update the search filter + result card to read the airline/departure-city names from the DTO (no free-text field). _No change needed: `SearchResultDto.airline` stays a name string (via join), and filters remain name-string query params (dropdown-izing filters is out of scope). Verified web typechecks clean._

## 6. Verify

- [x] 6.1 Run `bun run verify` (typecheck + lint + unit) and `bun run test:int`; confirm all green. _`verify`: 12/12 tasks pass (shared 46, api unit 43, + db/web typecheck & lint). `test:int`: 58 tests across 12 files, all green._
- [x] 6.2 Manually exercise: seed data present, admin CRUD + deactivate, form dropdowns with keep-assigned behavior, publish gating, search by airline — per the acceptance scenarios. _All scenarios pass. Surfaced 2 pre-existing infra bugs (fixed, folded in): (1) `@fastify/cors@11` default methods excluded PATCH/PUT/DELETE — admin edit/delete blocked; (2) `readApiError` used ky-v1 `response.json()` while ky v2 consumes the body into `error.data` — every API error showed the generic message. Search reached via `/dashboard/search` URL (no dashboard nav link exists — pre-existing gap, deferred to a separate tweak, not this change's scope)._
