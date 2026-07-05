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

- None blocking. Batching for very large tenants can be added later if provider volumes grow.
