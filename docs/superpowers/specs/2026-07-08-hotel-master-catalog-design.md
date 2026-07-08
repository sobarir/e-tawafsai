---
comet_change: hotel-master-catalog
role: technical-design
canonical_spec: openspec
---

# Hotel Master Catalog — Technical Design

Deep technical design for the `hotel-master-catalog` change (#4 of the
create-package-form revamp batch). Requirements are canonical in the OpenSpec
delta specs (`openspec/changes/hotel-master-catalog/specs/`); this doc records
HOW, not WHAT.

## Context

Hotels are entered as free text per package today: `package_hotels` holds
`cityName`, `name`, `stars`, `distanceM`, `isPelataran` keyed by `packageId`
(cascade). The same physical hotel is retyped per package with drift and typos.
Changes #2 (airline/departure-city) and #3 (provider-category-commission)
established the tenant-scoped master-table + admin-CRUD + form-dropdown +
keep-assigned idiom; this change applies it to hotels — with a richer model
because a hotel carries attributes, not just `{name, isActive}`.

Dependency direction is fixed: `shared ← db ← api`, `shared ← web`.

## Goals / Non-Goals

**Goals:** admin-managed hotel catalog with full attributes + `isActive`;
`package_hotels` reduced to a link; in-form city-filtered picker with detach;
publish "≥1 Makkah hotel" and package-search keep working via the catalog.

**Non-Goals:** hotel photos/geo/amenities; per-package attribute overrides;
backfilling existing free-text hotel rows; touching airline/city/category
masters or #5 inclusions/exclusions.

## Architecture

```
packages/shared         packages/db              apps/api                 apps/web
─────────────────       ──────────────           ────────────────         ─────────────────
createHotelSchema  ───► hotels table       ◄──── HotelsModule       ◄───── use-hotels hooks
updateHotelSchema       (name, city,             (ctrl/svc/policy,        master-data page
HotelDto                 stars, distanceM?,       mirrors airlines)        (Hotels admin form)
HotelInput={hotelId}     isPelataran,
PackageDto.hotels[]      isActive)          ◄──── packages.service   ◄───── packages/[id] form
 += hotelId,isPelataran  package_hotels           .addHotel({hotelId})     (city→picker→attach,
                         {packageId,hotelId}      .removeHotel(...)         detach w/ confirm)
                          unique, idx on           toHotelDto (join)
                          hotel_id                 search re-join
```

## Decisions

### D1 — Full normalization (from open phase)
`hotels` owns all attributes; `package_hotels = { packageId → packages(cascade),
hotelId → hotels }` with unique `(packageId, hotelId)` and an index on
`hotel_id` (Postgres does not auto-index FK columns; the existing `package_id`
index stays). Rationale: stars/distance/pelataran/city are intrinsic to the
physical hotel, mirroring #3 moving commission onto the category. Rejected: a
per-package snapshot + nullable `hotelId` — permits drift and duplicates the
shape.

### D2 — City = free-text `varchar(120)`, canonical-guided input
Column is free text so Makkah, Madinah, and transit/plus cities are all
expressible; uniqueness is on the normalized `(lower(btrim(name)),
lower(btrim(city)))` pair so one name may exist in two cities. The **admin form**
guides entry: a canonical select (Makkah / Madinah) plus a "transit/other"
escape revealing a free-text field. This keeps canonical city names spelled
consistently so the publish `cityName === "Makkah"` check and the picker's
`city === selectedCity` filter stay reliable. Rejected: enum(Makkah, Madinah) —
drops transit; pure free-text — typos silently break publish/search.

### D3 — `HotelsModule` mirrors `airlines`
New module (`apps/api/src/hotels`) copies the `airlines` structure
(controller/service/policy + `*.policy.spec.ts` + `*.service.int.spec.ts`).
Endpoints: `GET /hotels`, `POST /hotels`, `PATCH /hotels/:id`,
`DELETE /hotels/:id`, all `@UseGuards(JwtAuthGuard, RolesGuard)` +
`@Roles("admin")`, tenant-scoped, `noun.verb` structured logging. Normalized
name+city collision → `ConflictException`. Delete of a referenced hotel →
rejected (directed to deactivate); unreferenced → deleted. Register in
`app.module.ts`. Decisions live in `hotels.policy.ts`, HTTP exceptions in the
service (per repo convention).

### D4 — Attach `{ hotelId }` + detach endpoint
`POST /packages/:id/hotels` body becomes `{ hotelId }` (BREAKING). The service
validates the hotel belongs to the package's tenant (cross-tenant →
field-level error), inserts the link, and rejects duplicate attach (unique +
guard). New `DELETE /packages/:id/hotels/:hotelId` removes only the link, never
the catalog row. `HotelInput` in shared becomes `{ hotelId: string }`; add
`createHotelSchema` / `updateHotelSchema` (Zod: `name`, `city`, `stars` 1–5,
`distanceM` nullable, `isPelataran`, `isActive`) + `HotelDto`.

### D5 — DTO keeps `cityName`; typed mapper joins the catalog
`toHotelDto` joins `package_hotels → hotels` and maps `hotel.city → cityName`,
also exposing `hotelId` and `isPelataran`. `PackageDto.hotels[]` becomes
`{ hotelId, cityName, name, stars, distanceM, isPelataran }`. This preserves the
`package-search` DTO field names and the publish policy
(`pkg.hotels.some(h => h.cityName === "Makkah")`) with no consumer-shape churn,
while `hotelId` lets the client detach and dedupe the picker. Mapper is typed
(DRY rule #4) so contract↔persistence drift fails `verify`.

### D6 — Search re-joins through the catalog
`search.ts` hotels lateral (`json_agg`), hotel-name `EXISTS`, and `hotelCity`
filter re-join `package_hotels → hotels` reading `hotels.city / name / stars /
distance_m`. Output DTO unchanged (still `cityName` etc.).

### D7 — Web
`use-hotels` TanStack Query hooks (keys `["hotels", params]`, mutations
invalidate the resource root, over the shared `api` instance). Hotels admin
section on the master-data page (retitle "Airlines & Departure Cities" →
include Hotels) with a richer create/edit form (name; canonical-city select +
transit escape; stars; distance; pelataran; active), `isActive` toggle, and
delete behind `useConfirm`. The package form's hotel card: city select →
dropdown of active catalog hotels for that city (already-attached filtered out
by `hotelId`) → attach by `hotelId`; attached list renders from the DTO (so an
attached-but-deactivated hotel still shows — keep-assigned for a multi-attach
list), each row with a detach button gated by `useConfirm`.

## Migration Plan

1. `bun run db:generate` after the schema edits (create `hotels`; drop the five
   attribute columns from `package_hotels`; add `hotelId` FK + unique
   `(packageId, hotelId)` + index on `hotel_id`).
2. **Hand-verify the generated SQL**: it MUST `DELETE FROM package_hotels;`
   (fresh start, no backfill) BEFORE adding `hotelId NOT NULL`, otherwise the
   NOT NULL add fails on existing rows. Adjust the migration if drizzle omits it.
3. `bun run db:migrate`, then update the seed to insert demo catalog hotels and
   link Makkah + Madinah hotels to demo packages (so they still publish);
   `bun run db:seed`.
4. Ship shared + db + api + web together; `bun run verify` enforces contract
   compatibility.

Rollback recreates the columns but cleared per-package hotel data is
unrecoverable — acceptable pre-production.

## Risks / Trade-offs

- **Migration NOT NULL on populated table** → clear rows first (step 2).
- **City string matching** → canonical-guided input (D2).
- **New destructive detach flow** → `useConfirm`, never a bare mutation
  (repo convention; inherits `destructive-action-confirmation`).
- **Cross-tenant / duplicate attach** → tenant check + unique + server guard.

## Testing Strategy

- **Unit:** `hotels.policy.spec` (normalized name+city dup rejected,
  delete-when-referenced blocked, non-admin forbidden); extend
  `packages.policy.spec` for the Makkah check on the joined `cityName`.
- **Integration:** `hotels.service.int.spec` (CRUD + delete-guard,
  self-cleaning); extend `packages.service.int.spec` for attach-by-`hotelId`,
  cross-tenant reject, duplicate reject, detach, and publish passing with a
  Makkah catalog hotel.
- `bun run verify` (typecheck + lint + test) + `bun run test:int`.

## Open Questions

None blocking. Admin-UI placement (shared master-data page) may be revisited in
build if the page grows unwieldy — not a spec-level concern.
