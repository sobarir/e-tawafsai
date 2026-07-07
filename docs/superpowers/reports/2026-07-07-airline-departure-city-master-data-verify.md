# Verification Report — airline-departure-city-master-data

- **Date:** 2026-07-07
- **Change:** `airline-departure-city-master-data`
- **Verify mode:** full (21 tasks, 3 delta-spec capabilities, 54 changed files)
- **Result:** PASS

## Fresh evidence

| Command | Result |
| --- | --- |
| `bun run verify` (typecheck + lint + unit) | exit 0 — 12/12 turbo tasks; shared 46 + api 43 unit tests green |
| `bun run test:int` (Postgres integration) | exit 0 — 58 tests / 12 files green |
| Build (`bun run build`, via build-phase guard) | PASS |

## Full-verification checklist

1. **tasks.md all `[x]`** — PASS (build guard confirmed; 0 unchecked).
2. **Matches `design.md` (D1–D5)** — PASS:
   - D1 two tenant-global tables + `uniqueIndex(tenantId, lower(btrim(name)))` — migration 0017.
   - D2 nullable `airlineId`/`departureCityId` FKs, varchars dropped — migration 0018.
   - D3 `isActive` retire flag + in-use delete guard (409) — airlines/departure-cities services.
   - D4 additive DDL → backfill → drop, one-time, no data loss — migrations 0017/0018 (0 unbackfilled rows).
   - D5 Settings CRUD modules + web sections + TanStack hooks.
3. **Matches Design Doc** — PASS (`docs/superpowers/specs/2026-07-07-airline-departure-city-master-data-design.md`).
4. **All capability spec scenarios pass** — PASS (mapping below).
5. **proposal.md goals satisfied** — PASS (master tables, admin CRUD, backfill, form dropdowns, search-by-name).
6. **No delta-spec ↔ design-doc drift** — PASS (delta specs align with D1–D5; no incremental spec divergence).
7. **Design Doc locatable** — PASS.

## Spec scenario → evidence

| Spec scenario | Evidence |
| --- | --- |
| Create airline master row | `airlines.service.int.spec.ts` create test |
| Duplicate normalized name rejected | airlines & departure-cities int specs (ConflictException) |
| Delete blocked when referenced | airlines & departure-cities int specs (in-use guard) |
| Non-admin cannot mutate | `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles("admin")`; `roles.guard.spec.ts` |
| Publish blocked on missing airline/city | `packages.service.int.spec.ts` publish-gating test (field-error naming) + `packages.policy.spec.ts` |
| Airline/city must belong to tenant | `assertAirlineOwned` / `assertDepartureCityOwned` (tenant-scoped) |
| Draft may have no airline/city | packages create allows null |
| Airline filter over master data | `search.service.int.spec.ts` filter-by-airline test |
| Backfill: case/whitespace collapse, blank→null | migration 0017 (`lower(btrim(...))`, non-blank guard); verified 0 unbackfilled rows |
| Active filtering + assigned-row preservation | web package form `airlineOptions`/`departureCityOptions`; manual acceptance (task 6.2) |

## In-scope fixes surfaced during acceptance (task 6.2)

Two pre-existing infrastructure bugs were found while manually exercising this
change's admin CRUD and folded in (they blocked this change's acceptance):

1. **CORS methods** — `@fastify/cors@11` defaults allowed methods to
   `GET,HEAD,POST`, blocking browser PATCH/PUT/DELETE. `enableCors()` now sets
   methods explicitly. (`apps/api/src/main.ts`)
2. **ky v2 error body** — `readApiError` used ky-v1 `error.response.json()`,
   but ky v2 consumes the body into `error.data`, so every API error rendered
   the generic message. Now reads `error.data` first. (`apps/web/src/lib/api.ts`)

## Deferred (out of scope — separate changes)

- App-wide delete-confirmation dialog for all CRUD.
- App-wide 401 → redirect-to-login on session expiry.
- Dashboard nav link to `/dashboard/search` (search reachable by URL only).

## Code review

Single high-effort pass over the full branch diff after all tasks complete:
**no correctness bugs.** One low-severity efficiency note (`findAll` resolves
airline/city names per package, amplifying an existing N+1) — accepted, filed
as future cleanup, not a regression.
