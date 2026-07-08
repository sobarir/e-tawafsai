## Why

Today a package's hotels are typed as free text on every package (`package_hotels`
holds `cityName`, `name`, `stars`, `distanceM`, `isPelataran` per row), so the same
physical hotel is re-entered — and mistyped — for each package, with no reuse or
consistency. This is change #4 of the create-package-form revamp, and it finishes the
master-data pattern already applied to airlines, departure cities, and categories:
hotels become an admin-managed catalog that packages reference instead of retype.

## What Changes

- Introduce a tenant-global **hotel catalog** (`hotels`): `name`, `city` (free text
  so Makkah, Madinah, and transit/plus cities all work), `stars`, `distanceM`
  (nullable), `isPelataran`, `isActive`. Uniqueness is per `(tenant, lower(name),
  lower(city))` so the same hotel name may exist in two cities.
- **BREAKING (data model):** the hotel attribute columns move OFF `package_hotels`
  onto the catalog. `package_hotels` becomes a pure link `{ packageId, hotelId }`
  with a unique `(packageId, hotelId)` to block duplicates. The `cityName`, `name`,
  `stars`, `distanceM`, `isPelataran` columns are dropped from `package_hotels`.
- **Admin CRUD** for the catalog mirroring airlines/departure-cities: create, edit
  attributes, `isActive` toggle, delete-behind-confirm, and keep-assigned (a
  deactivated hotel still shows when a package already uses it). Because a hotel has
  more than `{name, isActive}`, it needs a richer admin form than the simple
  `MasterList`.
- **Form:** the "Add Hotel" section stops taking free-text fields; the admin picks a
  city, then selects an active catalog hotel for that city and attaches it. Attach
  posts `{ hotelId }` instead of full hotel fields. Multiple hotels per package
  (Makkah + Madinah + transit) still allowed.
- **BREAKING (API):** `POST /packages/:id/hotels` body changes from the full hotel
  shape to `{ hotelId }`; `HotelInput` in shared changes accordingly. New
  `/hotels` CRUD endpoints + Zod schemas are added to shared.
- **Migration (fresh start):** existing `package_hotels` rows are cleared (no
  backfill), columns dropped, `hotelId` added NOT NULL; demo seed adds a few catalog
  hotels and demo package↔hotel links so seeded packages still publish.

## Capabilities

### New Capabilities
- `hotel-master-catalog`: tenant-global hotel catalog with admin CRUD (create,
  edit-attributes, isActive toggle, delete-with-confirm, keep-assigned) and the
  in-form city-filtered hotel picker; `package_hotels` as a link to the catalog.

### Modified Capabilities
- `package-catalog`: the package's hotel fields are REPLACED by a `hotelId` reference
  to a Hotel catalog row (of the package's tenant); the publish rule "at least one
  Makkah hotel" is evaluated against the referenced catalog hotel's `city`.

## Impact

- **DB (`packages/db`):** new `hotels` table; `package_hotels` reshaped to
  `{ packageId, hotelId }`; migration (drop columns, add FK, clear rows); demo seed.
- **Shared (`packages/shared`):** `HotelInput` → `{ hotelId }`; new hotel Zod
  schemas + DTO/types; `PackageDto.hotels` gains each attached hotel's `city` so the
  publish rule and search can read it.
- **API (`apps/api`):** new `hotels` module (controller/service/policy) modeled on
  `airlines`; `packages.service` hotel attach + DTO mapping join through the catalog;
  `packages.policy` Makkah-hotel check reads catalog `city`; `search` service
  re-joins `package_hotels → hotels` (keeping DTO field names `cityName`, `name`,
  `stars`, `distanceM`).
- **Web (`apps/web`):** hotel-catalog admin UI + TanStack Query hooks
  (`use-hotels`); package form hotel section becomes a catalog picker.
- **Non-goals:** no hotel photos/geo/amenities; no per-package attribute overrides;
  no change to airline/city/category masters; #5 inclusions/exclusions untouched.
