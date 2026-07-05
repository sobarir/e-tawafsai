## Why

The `providers` table has no uniqueness enforcement, so tenants have accumulated
many duplicate provider records — the same real-world operator entered repeatedly
under case/whitespace variants of its name or with the same PPIU license. Duplicates
fragment packages across records, distort provider lists, and make commission and
activation state ambiguous. We need to both clean up the existing duplicates and
prevent new ones.

## What Changes

- Enforce **per-tenant** provider uniqueness on two keys:
  - normalized name — `lower(trim(name))`
  - normalized PPIU license — `trim(ppiuLicenseNo)`, only when present (NULL/blank is exempt)
- Add Postgres unique indexes (an expression index on the normalized name and a
  partial expression index on the PPIU license) as the hard guarantee.
- Add an application-level pre-check in `ProvidersService` create/update that returns
  **409 Conflict** identifying the conflicting provider before the DB error is hit.
- Normalize `ppiuLicenseNo` on write: empty string → `NULL` (so blanks never collide).
- Run a **one-time dedup migration** over existing data: within each tenant, group
  providers into duplicate clusters (transitive closure of shared normalized name
  **or** shared normalized PPIU), pick a canonical survivor (active first, then
  earliest ULID), repoint `packages.providerId` from losers to the survivor, and
  delete the loser rows. The survivor keeps its own field values as-is. Runs inside
  a transaction; must complete before the unique indexes are applied.
- **BREAKING** (data): duplicate provider rows are deleted and their packages
  repointed; provider IDs of losers no longer resolve.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `provider-management`: adds a uniqueness requirement (per-tenant, normalized name
  and PPIU) with 409 conflict behavior on create/update, PPIU blank→NULL
  normalization, and a one-time duplicate-merge cleanup that repoints packages to a
  canonical survivor. The existing registry/activation/cascade requirements are
  unchanged.

## Impact

- **Schema** (`packages/db`): new expression + partial unique indexes on `providers`;
  a migration for the dedup + repoint + index creation.
- **API** (`apps/api/src/providers`): `ProvidersService.create`/`update` gain a
  normalization + conflict pre-check; new `ConflictException` path.
- **Shared** (`packages/shared`): a name/PPIU normalization helper shared by the
  pre-check and (conceptually) the migration; no wire-shape change to request schemas.
- **FK graph**: only `packages.providerId` references `providers`; the dedup migration
  repoints that column. Departures hang off packages and are unaffected.
- **Out of scope**: no new UI screens, no PIHK uniqueness, no cross-tenant uniqueness,
  no field-value merging from losers, no fuzzy matching beyond case/whitespace.
