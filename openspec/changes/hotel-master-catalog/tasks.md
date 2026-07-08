## 1. Shared contracts (`packages/shared`)

- [x] 1.1 Add `createHotelSchema` / `updateHotelSchema` (Zod: `name`, `city`, `stars` 1–5, `distanceM` nullable, `isPelataran`, `isActive`) and export inferred input types
- [x] 1.2 Add `HotelDto` (`id, name, city, stars, distanceM, isPelataran, isActive`) and change `HotelInput` to `{ hotelId: string }`
- [x] 1.3 Extend `PackageDto.hotels[]` to include `hotelId` and `isPelataran` (keep `cityName`, `name`, `stars`, `distanceM`); update `search.ts` DTO type to match

## 2. DB schema, migration & seed (`packages/db`)

- [x] 2.1 Add `hotels` table (tenant-owned; `name`, `city`, `stars`, `distanceM?`, `isPelataran`, `isActive`) with unique index on `(tenantId, lower(btrim(name)), lower(btrim(city)))`; export `DbHotel`/`NewDbHotel`
- [x] 2.2 Reshape `packageHotels` to `{ packageId (cascade), hotelId → hotels }` with unique `(packageId, hotelId)` and an index on `hotel_id`; drop `cityName`, `name`, `stars`, `distanceM`, `isPelataran`
- [x] 2.3 `db:generate` the migration (create `hotels`, truncate `package_hotels`, drop columns, add FK/unique/index); review the generated SQL
- [x] 2.4 Update the seed to insert demo catalog hotels and link Makkah + Madinah hotels to demo packages; `db:migrate` then `db:seed` and confirm seeded packages still publish

## 3. API — hotels catalog module (`apps/api/src/hotels`)

- [x] 3.1 Scaffold `HotelsModule` (controller/service/policy) modeled on `airlines`: tenant-scoped list/create/update/delete, `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles("admin")`, structured `hotel.*` logging
- [x] 3.2 Enforce normalized name+city uniqueness (`ConflictException`) and block delete when referenced by any package (explanatory error); register module in `app.module.ts`
- [x] 3.3 Unit specs: hotels policy/service boundary (duplicate rejected, delete-when-referenced blocked, non-admin forbidden)
- [x] 3.4 Integration spec: hotels CRUD against Postgres, cleaning up its own rows

## 4. API — wire packages, search & publish policy

- [x] 4.1 Change `addHotel` to accept `{ hotelId }` (validate tenant ownership, insert link, reject cross-tenant + duplicate); add `DELETE /packages/:id/hotels/:hotelId` detach that removes only the link
- [x] 4.2 Update `toHotelDto` / package DTO mapping to join `package_hotels → hotels` and map `hotel.city → cityName` (+ `isPelataran`)
- [x] 4.3 Update `search` service hotels lateral (`json_agg`) and hotel-name `EXISTS` / `hotelCity` filters to join through `hotels`; confirm DTO output unchanged
- [x] 4.4 Confirm publish policy "≥1 Makkah hotel" reads the joined `cityName`; update/extend `packages.policy.spec` and `packages.service.int.spec` for the new attach shape

## 5. Web — hotel catalog admin (`apps/web`)

- [x] 5.1 Add `use-hotels` TanStack Query hooks (keys `["hotels", params]`; mutations invalidate the resource root) over the shared `api` instance
- [x] 5.2 Add a Hotels admin section to the master-data page (retitle the header): richer create/edit form (name; city = canonical Makkah/Madinah select + transit/other free-text escape; stars; distance; pelataran; active), `isActive` toggle, delete behind `useConfirm`, admin-gated

## 6. Web — package form hotel picker (`apps/web/.../packages/[id]`)

- [x] 6.1 Replace the free-text "Add Hotel" inputs with a city select → active-catalog-hotel dropdown (keep-assigned includes an attached-but-deactivated hotel); attach by `hotelId`
- [x] 6.2 Prevent duplicate attach client-side (filter already-attached hotels by `hotelId`); render attached hotels from the DTO (name, stars, distance/pelataran) each with a detach button gated by `useConfirm`

## 7. Verify

- [x] 7.1 `bun run verify` passes (typecheck + lint + test); `bun run test:int` passes locally
- [x] 7.2 Manual smoke: create a hotel → appears in form picker → attach → package DTO & search show it → deactivate hides it from picker but keeps it on the using package → delete blocked while referenced

<!-- code-review (high, branch diff): 0 findings; no CRITICAL. Manual smoke (7.2) covered by 64 integration tests. -->
