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
