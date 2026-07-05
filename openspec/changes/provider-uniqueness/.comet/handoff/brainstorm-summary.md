# Brainstorm Summary

- Change: provider-uniqueness
- Date: 2026-07-06

## Confirmed Technical Approach

**Dedup mechanism: Option A (confirmed)** — a one-time TS dedup script (mirrors
`packages/db/src/seed.ts`, run via `bun`) + a separate drizzle SQL migration that adds
the unique indexes.

- Script per tenant: in-memory **union-find** over edges (shared normalized name OR
  shared non-empty normalized PPIU) → clusters → pick survivor (active first, then
  lowest ULID) → repoint `packages.providerId` losers→survivor → delete losers, all in
  ONE DB transaction. Also normalizes blank PPIU ('' / whitespace) → NULL first.
- Clustering is a pure, unit-testable function; whole merge integration-tested against
  real Postgres (repo `test:int` pattern).
- Ordering: documented runbook (dedup script → `db:migrate`). If migrate runs first it
  fails SAFELY (duplicates present) — no corruption.
- Naturally idempotent: re-running on clean data finds no clusters → no-op.

## Repo precedent leveraged

- Per-tenant unique index pattern exists: `users_tenant_email_unique` on `(tenantId, email)`.
- Hand-edited/custom SQL migrations are normal (0011/0012: GENERATED cols, GIN).
- `lower(trim(name))` uses only IMMUTABLE funcs → expression index is safe (no unaccent trap).
- Only FK into providers is `packages.providerId`.

## Key Trade-offs and Risks

- Destructive deletes → single transaction; repoint before delete; deterministic ULID tie-break.
- Two-step runbook (script then migrate) not tooling-enforced → mitigated by safe-fail ordering.

## Testing Strategy

- Unit: normalization helper (case/whitespace/blank); union-find clustering (chained name↔ppiu).
- Integration: seed a tenant with name-dup + ppiu-dup forming one cluster → assert one survivor,
  packages repointed no orphans, active-preference; constraint rejects dup insert, allows blank/cross-tenant.

## Resolved decisions

- Dry-run/report mode: **No** — single direct-apply command; script logs merges it performs.
- Unique index declaration: **Drizzle schema** `uniqueIndex().on(sql\`lower(trim(name))\`)` +
  partial `.where(sql\`ppiu_license_no IS NOT NULL\`)`; `drizzle-kit generate` emits SQL,
  hand-verify/edit the migration if needed (precedent: 0011/0012).

## Spec Patches

- None. Delta spec already covers all confirmed scenarios; no dry-run scenario needed.
