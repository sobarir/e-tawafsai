---
comet_change: provider-uniqueness
role: technical-design
canonical_spec: openspec
---

# Provider uniqueness — technical design

Deep design for enforcing per-tenant provider uniqueness (normalized name + PPIU),
returning a 409 on conflicting create/update, and cleaning up existing duplicates via a
one-time merge. The OpenSpec delta at `openspec/changes/provider-uniqueness/specs/provider-management/spec.md`
is the canonical requirements source; this document is the HOW.

## Context

`providers` is tenant-owned with no uniqueness enforcement; `ProvidersService.create()`
inserts unconditionally. Tenants have accumulated duplicates of the same real-world
operator (case/whitespace name variants, or the same PPIU license). The only FK into
`providers` is `packages.providerId`; departures reference packages, not providers, so a
cleanup only has to repoint packages.

Repo precedent this design leans on:
- Per-tenant unique index is idiomatic: `users_tenant_email_unique` on `(tenantId, email)`.
- Hand-authored/edited SQL migrations are normal (`0011`/`0012`: GENERATED columns, GIN).
- The team is IMMUTABLE-aware (the `unaccent()` note in the search migration). `lower()` and
  `trim()`/`btrim()` are IMMUTABLE, so an expression index on `lower(trim(name))` is safe.
- One-off procedural work runs as a `bun` script (`db:seed` = `bun src/seed.ts`).

## Goals / Non-Goals

**Goals**
- Per-tenant uniqueness on normalized name (`lower(trim(name))`) and normalized PPIU
  (`trim`, non-empty), enforced by DB index + app 409 pre-check.
- One-time automated merge of existing duplicates that preserves all packages.
- Blank PPIU (`""`/whitespace) normalized to `NULL` on every write.

**Non-Goals**
- Cross-tenant/global uniqueness; PIHK uniqueness.
- Merging loser field values into the survivor (survivor kept as-is).
- Fuzzy/similarity matching beyond case + whitespace.
- New UI, admin merge workflow, or a dry-run mode.

## Decisions

### D1 — Shared normalization helpers (`packages/shared`)
`normalizeProviderName(s) = s.trim().toLowerCase()` and
`normalizePpiu(s) = s == null ? null : (t => t === "" ? null : t)(s.trim())`.
Pure functions, exported from the shared index, used by BOTH the service pre-check and the
dedup script so the normalization rule has exactly one definition (DRY per AGENTS.md).
_Alternative rejected:_ duplicate the rule in api + db → drift risk.

### D2 — DB enforcement: expression + partial unique indexes, tenant-scoped
Declared in the Drizzle `providers` schema:
- `uniqueIndex("providers_tenant_name_unique").on(providers.tenantId, sql`lower(trim(${providers.name}))`)`
- `uniqueIndex("providers_tenant_ppiu_unique").on(providers.tenantId, sql`trim(${providers.ppiuLicenseNo})`).where(sql`${providers.ppiuLicenseNo} IS NOT NULL`)`

`drizzle-kit generate` emits the SQL; hand-verify/edit the generated migration if the
expression/partial output is imperfect (precedent: `0011`/`0012`). The DB index is the
authoritative backstop against races.
_Alternative rejected:_ app-only enforcement → no guarantee under concurrency.

### D3 — App pre-check → 409 before write
`ProvidersService.create`/`update`:
1. Normalize `ppiuLicenseNo` (blank → `null`) before persisting.
2. Query the tenant for a collision:
   `WHERE tenant_id = :t AND (lower(trim(name)) = :name OR (ppiu_license_no IS NOT NULL AND trim(ppiu_license_no) = :ppiu))`,
   adding `AND id <> :id` on update to exclude self.
3. On match → `ConflictException` naming the existing provider (rendered by the global
   `AllExceptionsFilter` envelope).
4. Catch a DB unique-violation and map it to the same 409 (concurrency backstop).
_Alternative rejected:_ rely only on the DB error → generic message, leaks constraint names.

### D4 — Duplicate clustering = union-find over name|ppiu edges (per tenant)
A provider can be a name-duplicate of one row and a PPIU-duplicate of another, so grouping
is a connected-components problem, not pairwise. Build edges within a tenant: connect two
providers if they share a normalized name OR a non-empty normalized PPIU; connected
components are the clusters. Implemented as a pure, unit-testable union-find function.
_Alternative rejected:_ recursive-CTE union-find in pure SQL → gnarly, hard to test.

### D5 — Survivor = active-first then lowest ULID; fields untouched
Per cluster with >1 member, survivor = the one with `isActive = true` (if any), else the
lowest ULID (earliest created, deterministic). Losers contribute only their packages.
_Alternative rejected:_ "most complete record" → unpredictable, harder to audit.

### D6 — One-time TS dedup script + separate index migration (Option A)
`packages/db/src/scripts/dedup-providers.ts`, run via `bun` (mirrors `seed.ts`), performs
in ONE `sql.begin()` transaction, per tenant:
1. Normalize blank `ppiu_license_no` → `NULL`.
2. Cluster (D4) → survivor (D5).
3. `UPDATE packages SET provider_id = survivor WHERE provider_id IN (losers)`.
4. `DELETE FROM providers WHERE id IN (losers)`.
Logs each merge (`{ tenantId, survivorId, loserIds, packagesRepointed }`). It applies
directly (no dry-run) and is idempotent — a second run on clean data finds no clusters.
The unique indexes (D2) ship as a normal drizzle migration run afterwards.

**Runbook / ordering:** run the dedup script, then `bun run db:migrate`. Ordering is not
tooling-enforced, but running `db:migrate` first fails *safely* — the `CREATE UNIQUE INDEX`
errors on existing duplicates with no data change. The spec's "cleanup atomic and before
the indexes" holds: the merge is one transaction and precedes index creation.

## Risks / Trade-offs

- **Destructive deletes** → single transaction; repoint before delete; deterministic ULID
  tie-break makes survivor selection reproducible for audit.
- **Two-step runbook not enforced** → mitigated by safe-fail ordering (index creation on
  dirty data errors, never corrupts).
- **`""` vs `NULL` PPIU drift re-appearing** → normalization enforced on every write (D1/D3),
  not just in the migration.
- **Concurrency between pre-check and insert** → DB unique index authoritative; unique
  violation mapped to 409.
- **Large tenants** → per-tenant, set-based grouping; provider counts are modest, single
  pass is fine. Batching can be added later if volumes grow.

## Migration Plan

1. Ship D1 normalization + D3 pre-check (safe with or without indexes present).
2. Run `dedup-providers.ts` once (merges + repoints, logged).
3. `bun run db:migrate` to add the D2 unique indexes.
4. Rollback: the dedup transaction aborts before commit on failure; a post-commit undo would
   need a backup restore (acceptable — the merge is intentional and packages are preserved).

## Testing Strategy

- **Unit:** normalization helpers (case/whitespace/blank→null); union-find clustering incl.
  chained `A—name—B—ppiu—C` → one cluster; survivor selection (active beats older ULID).
- **Integration (`test:int`, real Postgres):** seed a tenant with a name-dup + a ppiu-dup
  forming one cluster → assert one survivor, packages repointed with zero orphans,
  active-preference honored; assert the unique index rejects a direct duplicate insert but
  allows blank-PPIU rows and the same name/PPIU under a second tenant.

## Open Questions

None blocking.
