# Brainstorm Summary

- Change: hotel-master-catalog
- Date: 2026-07-08

## Confirmed Technical Approach

Full normalization (confirmed in open phase, unchanged): tenant-global `hotels`
catalog holds `name`, `city`, `stars`, `distanceM?`, `isPelataran`, `isActive`;
`package_hotels` becomes a pure link `{ packageId, hotelId }` with unique
`(packageId, hotelId)`. `hotels` module mirrors `airlines`
(controller/service/policy + policy.spec + service.int.spec; GET/POST/PATCH:id/
DELETE:id), admin-guarded, normalized name+city uniqueness, delete blocked when
referenced.

Design-phase technical decisions (confirmed this session):

1. **City input UX** — catalog admin enters city via a canonical select
   (Makkah / Madinah) plus a "Transit/other" escape that reveals a free-text
   field. Column stays `varchar(120)`. This keeps "Makkah"/"Madinah" spelled
   consistently so the publish "≥1 Makkah hotel" check and the picker's
   city-filter stay reliable, while still supporting transit cities.

2. **Detach** — each attached hotel gets a detach button gated behind the shared
   `useConfirm` dialog (treated as a destructive unlink per repo convention).
   Requires `DELETE /packages/:id/hotels/:hotelId` + a web detach mutation.

3. **DTO hotel item carries `hotelId`** (in addition to `cityName`, `name`,
   `stars`, `distanceM`, `isPelataran`) so the client can target detach and
   filter already-attached hotels out of the picker.

4. **Keep-assigned for hotels** = the attached-hotels list renders from the
   package DTO (join), so an attached-but-deactivated hotel still shows; the
   picker itself lists only active hotels of the chosen city.

## Key Trade-offs and Risks

- **Migration ordering (drizzle gotcha)** → `hotelId NOT NULL` on a table with
  existing rows requires clearing rows first. The generated migration SQL must be
  hand-checked to `DELETE FROM package_hotels;` (fresh start, no backfill) BEFORE
  adding the NOT NULL FK, then add unique `(packageId, hotelId)` + index on
  `hotel_id`. Rollback recreates columns but per-package hotel data is not
  recoverable — acceptable pre-production.
- **City string matching** → mitigated by the canonical select (decision 1);
  publish `cityName === "Makkah"` and picker filter compare exact strings.
- **New destructive flow (detach)** → must use `useConfirm`, not a bare mutation.

## Testing Strategy

- Unit: `hotels.policy.spec` (normalized name+city dup rejected, delete-when-
  referenced blocked, non-admin forbidden); extend `packages.policy.spec` for the
  Makkah-hotel check reading the joined `cityName`.
- Integration: `hotels.service.int.spec` (CRUD + delete-guard, self-cleaning);
  extend `packages.service.int.spec` for attach-by-`hotelId`, cross-tenant reject,
  duplicate-attach reject, detach, and publish passing with a Makkah catalog hotel.
- `bun run verify` (typecheck+lint+test) + `bun run test:int`.

## Spec Patches

- `hotel-master-catalog` delta: add a scenario for the canonical-city input /
  transit escape, and make the DTO `hotelId` field + detach endpoint explicit
  (the "detach keeps the catalog row" scenario already exists). No structural
  rewrite.
- `package-catalog` delta: unchanged (hotel fields → `hotelId` reference already
  captured).
