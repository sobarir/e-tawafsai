# Verification Report: provider-uniqueness

- Date: 2026-07-06
- Mode: full
- Base ref: f62d9901db75beb238507c9b42aa838c47fd7ecf → HEAD

## Summary

| Dimension    | Status                                             |
|--------------|----------------------------------------------------|
| Completeness | 16/16 tasks complete; 3/3 requirements implemented |
| Correctness  | 9/9 spec scenarios covered (8 tested, 1 structural)|
| Coherence    | Design decisions D1–D6 followed; no drift          |

## Fresh verification evidence

| Check | Command | Result |
|-------|---------|--------|
| Quality gate | `bun run verify` | PASS — 12/12 turbo tasks (typecheck + lint + test); shared 34 tests, api 35 tests |
| Provider integration | `bun run test:int -- providers` | PASS — 3 files, 8 tests |
| Migration apply | `bun packages/db/src/dedup-providers-runner.ts` then `bun run db:migrate` | PASS — dedup clean (0 clusters), indexes applied |
| Change validation | `openspec validate provider-uniqueness` | PASS — valid |

## Requirement → implementation → test map

### Requirement: Provider uniqueness per tenant
- Impl: `apps/api/src/providers/providers.service.ts` `assertNoConflict` (pre-check → 409) +
  `isUniqueViolation` (DB backstop); unique indexes in `packages/db/src/schema/providers.ts`.
- Scenarios:
  - Reject dup name → `providers.service.int.spec.ts` (create name variant) ✔
  - Reject dup PPIU → `providers.service.int.spec.ts` (create ` LIC ` variant) ✔
  - Reject update collision → `providers.service.int.spec.ts` (rename onto peer) ✔
  - Blank PPIU never collides → `providers.service.int.spec.ts` + `providers-unique-index.int.spec.ts` (null rows) ✔
  - Same value across tenants → **structural**: both indexes lead with `tenant_id`;
    pre-check runs through `TenantScopedDb` (scoped to active tenant). No dedicated int
    test (SUGGESTION below).

### Requirement: PPIU blank normalization on write
- Impl: `normalizePpiu` applied in create + update; dedup step 1 (`btrim(ppiu)=''` → NULL).
- Scenario: empty PPIU stored as NULL → create test asserts `blank.ppiuLicenseNo` is null;
  dedup int test asserts `'   '` → null ✔

### Requirement: One-time duplicate merge cleanup
- Impl: `packages/db/src/scripts/dedup-providers.ts` (`planProviderMerges` union-find in
  shared, `applyProviderMerges` transaction, `dedupeProviders` orchestration).
- Scenarios:
  - Cluster consolidated to one survivor → shared unit `planProviderMerges` chained cluster ✔
  - Packages repointed, no orphans → dedup int test (`repointed:1, deleted:1`, pkg repointed) ✔
  - Survivor prefers active → shared unit `prefers an active survivor` ✔

## Coherence (design adherence)

D1 shared normalization helpers ✔ · D2 expression + partial tenant-scoped unique indexes ✔ ·
D3 409 pre-check + friendly message ✔ · D4 union-find clustering ✔ · D5 active-then-ULID
survivor, fields untouched ✔ · D6 TS dedup script + separate index migration, runbook order ✔.
No contradictions between delta spec and design doc.

## Issues

### CRITICAL
None.

### WARNING
None.

### SUGGESTION
1. **Cross-tenant coverage test** — scenario "same name/PPIU across tenants" is guaranteed
   structurally (indexes lead with `tenant_id`; pre-check is tenant-scoped) but has no
   dedicated integration test. Consider adding one for regression safety. Non-blocking.
2. **Pre-check whitespace class** (`providers.service.ts` / `provider-dedup.ts`) — JS
   `.trim()` strips all Unicode whitespace while SQL `btrim`/`trim` strips spaces only. A
   name differing only by an exotic-whitespace char could slip past the JS pre-check, but
   the DB unique index backstops it (insert → 23505 → same 409). No duplicate can leak;
   only the error message would be the generic form. **Accepted** — defense-in-depth covers
   it and real provider names don't contain tabs/newlines.

## Final Assessment

All checks passed. No critical or important issues. Two accepted SUGGESTION-level notes
recorded above. Ready for archive.
