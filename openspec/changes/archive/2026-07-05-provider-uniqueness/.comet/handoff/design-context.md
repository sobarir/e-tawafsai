# Comet Design Handoff

- Change: provider-uniqueness
- Phase: design
- Mode: compact
- Context hash: fca79ea15f47901f9bef2b29bf325b9c8bfc2f74a940f46b2b8daead51ac6197

Generated-by: comet-handoff.sh

OpenSpec remains the canonical capability spec. This handoff is a deterministic, source-traceable context pack, not an agent-authored summary.

## openspec/changes/provider-uniqueness/proposal.md

- Source: openspec/changes/provider-uniqueness/proposal.md
- Lines: 1-52
- SHA256: 1d074e086b1321df715c11650a4c007980b9699e7c86eeed2368c35f24fc74fd

```md
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
```

## openspec/changes/provider-uniqueness/design.md

- Source: openspec/changes/provider-uniqueness/design.md
- Lines: 1-82
- SHA256: 9708a9b1e017116d5aa07c3b0f4ac73205b7fc262541da6e1708a3cea74014ba

[TRUNCATED]

```md
## Context

`providers` is a tenant-owned table with no uniqueness enforcement. `ProvidersService.create()`
inserts unconditionally. Over time tenants have entered the same real-world operator multiple
times — as case/whitespace variants of the name, or with the same PPIU license — producing
"many duplicates". The only FK into `providers` is `packages.providerId`; departures reference
packages, not providers. Any cleanup must therefore repoint packages but touches nothing else in
the FK graph.

This document is the high-level (open-phase) design. The deep design (brainstorming + finalized
approach) is produced in the Comet design phase; the delta spec at
`specs/provider-management/spec.md` is the living contract.

## Goals / Non-Goals

**Goals:**
- Per-tenant uniqueness on normalized name (`lower(trim(name))`) and normalized PPIU (`trim`, non-empty).
- Hard DB guarantee (unique indexes) plus friendly app-level `409` pre-check.
- One-time automated cleanup of existing duplicates that preserves all packages.

**Non-Goals:**
- Cross-tenant/global uniqueness; PIHK uniqueness.
- Field-value merging from losers into the survivor (survivor kept as-is).
- Fuzzy/similarity matching beyond case + whitespace normalization.
- New UI screens or admin merge workflow.

## Decisions

**D1 — Normalization key: `lower(trim(name))` and `trim(ppiu)`, blank→NULL.**
Duplicates are overwhelmingly case/whitespace variants. Normalizing on write (empty PPIU → `NULL`)
keeps blanks out of the constraint (Postgres allows many NULLs in a unique index).
_Alternative rejected:_ exact match — misses the actual duplicate shape.

**D2 — Enforce with expression + partial unique indexes, scoped by `tenantId`.**
- `UNIQUE (tenant_id, lower(trim(name)))`
- `UNIQUE (tenant_id, trim(ppiu_license_no)) WHERE ppiu_license_no IS NOT NULL`
The DB is the backstop against races; the app pre-check gives the good error.
_Alternative rejected:_ app-only enforcement — loses the guarantee under concurrency.

**D3 — App pre-check returns `409 Conflict` before insert/update.**
`ProvidersService.create/update` normalize input, query the tenant for a name/PPIU match, and throw
`ConflictException` naming the existing provider. Matches the repo's error-envelope convention.
_Alternative rejected:_ rely only on the DB error → generic message, leaks constraint names.

**D4 — Cluster = transitive closure over name-edges OR ppiu-edges within a tenant.**
Because a row can be a name-duplicate of one row and a PPIU-duplicate of another, dedup is a
connected-components problem, not pairwise. Union-Find (or an equivalent grouping pass) over each
tenant's rows.

**D5 — Survivor = active-first, then lowest ULID; survivor fields untouched.**
Keeps a live, established record; ULID tie-break is deterministic and time-ordered. Losers
contribute only their packages (repointed).

**D6 — Cleanup runs as a one-shot migration inside a transaction, before index creation.**
Order: (1) normalize blank PPIUs to NULL, (2) build clusters + repoint `packages.providerId`,
(3) delete losers, (4) create the unique indexes. If any step fails the whole migration rolls back,
leaving the pre-migration state (and no half-applied constraint).

## Risks / Trade-offs

- **Destructive deletes** → run entirely in one transaction; repoint packages before delete; the
  ULID tie-break makes survivor selection reproducible for audit.
- **Index creation fails if a cluster was missed** → index creation is the last step in the same
  migration, so a missed duplicate aborts the whole run rather than half-applying.
- **`""` vs `NULL` PPIU drift re-appearing after deploy** → normalization enforced on every write
  (D1/D3), not just in the migration.
- **Concurrency between pre-check and insert** → DB unique index is the authoritative backstop; the
  service maps a unique-violation to the same `409`.
- **Large tenants** → grouping is per-tenant and set-based; expected provider counts are modest, so
  a single-pass migration is acceptable (no batching needed initially).

## Migration Plan

1. Ship normalization + `409` pre-check in `ProvidersService` (safe with or without indexes).
2. Run the dedup migration (normalize blanks → cluster + repoint → delete losers → create unique
   indexes), all in one transaction.
3. Rollback = transaction abort before commit; post-commit rollback would require restoring deleted
   loser rows from backup (acceptable given the merge is intentional and packages are preserved).

## Open Questions
```

Full source: openspec/changes/provider-uniqueness/design.md

## openspec/changes/provider-uniqueness/tasks.md

- Source: openspec/changes/provider-uniqueness/tasks.md
- Lines: 1-30
- SHA256: e834f8d709777992f381770bb5b00cd1524f4bbe3f2cd2b2008abfaaf70d69d2

```md
## 1. Shared normalization

- [ ] 1.1 Add a provider-key normalization helper in `packages/shared` (`normalizeProviderName` → `lower(trim)`, `normalizePpiu` → `trim`, empty → `null`) with unit spec covering case/whitespace/blank cases
- [ ] 1.2 Export the helper from the shared package index

## 2. API enforcement (create/update pre-check)

- [ ] 2.1 In `ProvidersService.create`, normalize PPIU (blank→null) and pre-check the tenant for a name or PPIU collision; throw `ConflictException` identifying the existing provider
- [ ] 2.2 In `ProvidersService.update`, apply the same normalization + collision pre-check, excluding the row being updated
- [ ] 2.3 Map a DB unique-violation to the same `409 Conflict` as a concurrency backstop
- [ ] 2.4 Unit specs: create/update rejected on name dup, PPIU dup, update-into-collision; blank PPIU allowed; cross-tenant allowed (policy/service-level)

## 3. Dedup migration (one-time cleanup)

- [ ] 3.1 Implement per-tenant duplicate clustering (transitive closure over normalized-name OR non-empty normalized-PPIU edges)
- [ ] 3.2 Implement survivor selection (active first, then lowest ULID) and package repoint (`packages.providerId` losers→survivor), then delete losers — all in one transaction
- [ ] 3.3 Normalize existing blank PPIUs to NULL as the first migration step
- [ ] 3.4 Integration spec: seed a tenant with a name-dup and a PPIU-dup forming one cluster; assert one survivor, packages repointed with no orphans, active-preference honored

## 4. DB unique constraints

- [ ] 4.1 Add expression unique index `UNIQUE (tenant_id, lower(trim(name)))` on `providers`
- [ ] 4.2 Add partial expression unique index `UNIQUE (tenant_id, trim(ppiu_license_no)) WHERE ppiu_license_no IS NOT NULL`
- [ ] 4.3 Generate the migration and sequence it AFTER the dedup cleanup (same transaction / same migration run)
- [ ] 4.4 Integration spec: constraint rejects a direct duplicate insert; allows blank-PPIU and cross-tenant rows

## 5. Verify

- [ ] 5.1 Run `bun run db:migrate` then `bun run db:seed` on a duplicate-laden fixture and confirm clean apply
- [ ] 5.2 `bun run verify` (typecheck + lint + test) and `bun run test:int` for providers pass
```

## openspec/changes/provider-uniqueness/specs/provider-management/spec.md

- Source: openspec/changes/provider-uniqueness/specs/provider-management/spec.md
- Lines: 1-67
- SHA256: ff96061c165f0136a48b992eb0a2fe6c6d24199d20dd857369cac0cb76d78191

```md
## ADDED Requirements

### Requirement: Provider uniqueness per tenant

Within a single tenant, Providers SHALL be unique on two independent keys: the
**normalized name** (`lower(trim(name))`) and the **normalized PPIU license number**
(`trim(ppiuLicenseNo)`, evaluated only when non-empty). A create or update that would
make a Provider's normalized name equal an existing Provider's normalized name in the
same tenant, or its normalized PPIU equal an existing non-empty PPIU in the same tenant,
SHALL be rejected. Uniqueness SHALL be enforced both by a database constraint (the hard
guarantee) and by an application pre-check that returns a `409 Conflict` identifying the
conflicting Provider. Uniqueness is scoped per tenant: the same name or PPIU MAY exist
under different tenants.

#### Scenario: Reject create with duplicate normalized name
- **WHEN** a tenant already has a Provider named "PT Al Hijaz" and an admin creates a Provider named "pt al hijaz " in the same tenant
- **THEN** the request is rejected with `409 Conflict` and the response identifies the existing Provider; no new row is inserted

#### Scenario: Reject create with duplicate PPIU license
- **WHEN** a tenant already has a Provider with PPIU "12345" and an admin creates a Provider with PPIU " 12345 " in the same tenant
- **THEN** the normalized PPIU matches and the request is rejected with `409 Conflict`

#### Scenario: Reject update that collides with another provider
- **WHEN** an admin updates a Provider's name (or PPIU) so its normalized value equals another Provider's in the same tenant
- **THEN** the request is rejected with `409 Conflict` and the Provider is left unchanged

#### Scenario: Blank PPIU never collides
- **WHEN** two Providers in the same tenant have no PPIU (empty or NULL) and different names
- **THEN** both are allowed; blank PPIU values are exempt from the uniqueness rule

#### Scenario: Same name or PPIU allowed across tenants
- **WHEN** tenant A has a Provider with PPIU "12345" and tenant B creates a Provider with PPIU "12345"
- **THEN** tenant B's create succeeds because uniqueness is scoped per tenant

### Requirement: PPIU blank normalization on write

When a Provider is created or updated, an empty or whitespace-only `ppiuLicenseNo` SHALL
be stored as `NULL`, and a non-empty `ppiuLicenseNo` SHALL be stored trimmed. This keeps
blank licenses exempt from the uniqueness constraint and prevents `""`-vs-`NULL` drift.

#### Scenario: Empty PPIU stored as NULL
- **WHEN** an admin saves a Provider with `ppiuLicenseNo` set to `""` or whitespace
- **THEN** the stored value is `NULL`

### Requirement: One-time duplicate merge cleanup

Before the uniqueness constraint takes effect, existing duplicate Providers SHALL be
consolidated per tenant. Providers SHALL be grouped into duplicate clusters by the
transitive closure of shared normalized name OR shared non-empty normalized PPIU within
the same tenant. For each cluster the system SHALL select one canonical survivor —
preferring an active Provider (`isActive = true`), then the earliest-created (lowest
ULID) — repoint every `packages.providerId` from the non-survivors to the survivor, and
delete the non-survivor rows. The survivor SHALL retain its own field values unchanged.
The cleanup SHALL run atomically (one transaction) and complete before the unique indexes
are applied.

#### Scenario: Cluster consolidated to one survivor
- **WHEN** a tenant has Providers A, B, C where A and B share a normalized name and B and C share a normalized PPIU
- **THEN** all three form one cluster, a single survivor is kept (active first, else lowest ULID), and the cluster resolves to that one Provider

#### Scenario: Packages repointed, no orphans
- **WHEN** a non-survivor Provider owns Packages and is merged into the survivor
- **THEN** those Packages' `providerId` is updated to the survivor and no Package is left referencing a deleted Provider

#### Scenario: Survivor selection prefers active
- **WHEN** a cluster contains one active Provider and older inactive Providers
- **THEN** the active Provider is the survivor even if it is not the oldest
```

