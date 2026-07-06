# Verification Report: provider-category-commission

- Date: 2026-07-07
- Mode: full
- Change: #3 of the Create Package form revamp
- Branch: feature/20260706/provider-category-commission (base a1db2b5)

## Summary

| Dimension    | Status |
|--------------|--------|
| Completeness | 25/25 OpenSpec tasks `[x]`; all 5 delta-spec capabilities implemented |
| Correctness  | All key spec scenarios covered by tests; 48/48 API int tests + 2/2 migration-safety tests + 39 unit tests pass |
| Coherence    | Follows design D1–D6; ONE recorded divergence — migration mechanism (see WARNING) |

## Fresh verification evidence

- `bun run verify` → 12/12 turbo tasks pass (typecheck + lint + test). (FULL TURBO cache — no code changed since the last real green run; only tracker/plan markdown updated.)
- `apps/api` `bun run test:int` → **10 files, 48 tests pass** (fresh).
- `packages/db` `migrate-cutover.int.spec.ts` → **2 tests pass** (fresh) — proves existing rows are repointed before the column drop.
- `openspec validate provider-category-commission` → valid.
- `grep -c '- [ ]' tasks.md` → 0 unchecked.

## 7-point full-verification checklist

1. **All tasks.md tasks completed** — ✅ 25/25 `[x]`.
2. **Implementation matches openspec/changes/.../design.md (D1–D6)** — ✅
   - D1 `package_categories` table scoped by (tenant, provider, productType), normalized-name unique index — `packages/db/src/schema/packages.ts`.
   - D2 nullable `packages.categoryId` FK; enum dropped at cutover — schema + migration 0016.
   - D3 provider `defaultCommission*` seeds new categories — `categories.service.ts create()`.
   - D4 migration additive → backfill → cutover — **mechanism diverged (see WARNING)**; behavior satisfied.
   - D5 admin-guarded categories CRUD, uniqueness 409, in-use delete 409 — `categories.{service,controller}.ts`.
   - D6 provider-page category UI + provider/type-filtered form dropdown + name search filter — web layer.
3. **Implementation matches Design Doc (docs/superpowers/specs/2026-07-06-…)** — ✅ except the migration mechanism (WARNING below).
4. **Capability spec scenarios pass** — ✅ (mapping below).
5. **proposal.md goals satisfied** — ✅ admin-defined categories, commission at category (provider default = seed), nullable categoryId FK, existing-data migration, provider/type-filtered dropdown, name-based search filter, admin-only category commission.
6. **No delta-spec ↔ design-doc contradiction** — delta specs (behavioral) hold; the design doc's migration *mechanism* is now stale (WARNING → Spec-Drift decision).
7. **Design Doc locatable** — ✅ `docs/superpowers/specs/2026-07-06-provider-category-commission-design.md`.

## Spec scenario → evidence mapping (key scenarios)

| Capability | Scenario | Evidence |
|-----------|----------|----------|
| provider-category-commission | Create scoped category; same name across scope; duplicate 409; admin-only CRUD | `categories.service.int.spec.ts` (7 cases) |
| provider-category-commission | Commission seeded from provider default; staff strip | `categories.service.int.spec.ts`, `categories.policy.spec.ts` |
| provider-category-commission | In-use category cannot be hard-deleted (409) | `categories.service.int.spec.ts` |
| package-catalog | categoryId nullable; category must match provider+type; publish requires category; draft may have no category | `packages.service.int.spec.ts` (incl. update-scope regression), `packages.policy.spec.ts` |
| package-search | Filter by category name across providers | `search.service.int.spec.ts` |
| user-management / provider-management | Category & provider commission stripped for staff | policy specs + DTO mappers |
| (migration) every existing package → non-null categoryId | atomic backfill-then-drop | `migrate-cutover.int.spec.ts` |

## WARNING — Migration mechanism divergence (user-approved)

**Design doc D4 / Migration Plan** describe: additive migration (0015) → a standalone idempotent **TS backfill runner** (`db:backfill-categories`) → cutover migration (0016) that drops the column. Task 9 built exactly that.

**Actual implementation:** during the Task 10 cutover, a data-safety review found that a bare auto-applied `DROP COLUMN` (with the runner meant to run in an operator-managed window between 0015 and 0016) would **silently lose existing packages' category data**, because `drizzle-kit migrate` applies 0015+0016 back-to-back with no window. The user chose to **fold the backfill into the cutover migration SQL** (migration 0016 now INSERTs categories from provider defaults + repoints packages, THEN drops the column/type — atomic and deploy-order-safe). The standalone TS runner was removed as superseded.

- **Behavioral spec impact:** none — "every existing package ends on a valid categoryId" is still guaranteed and is proven by `migrate-cutover.int.spec.ts`.
- **Severity:** WARNING (documentation drift; the substantive change was explicitly user-approved during build).
- **Resolution:** recorded here; design-doc handling per Spec-Drift decision (append Implementation Divergence to the Design Doc, or mark superseded at archive).

## Assessment

No CRITICAL or IMPORTANT issues. One WARNING (migration-mechanism documentation drift, user-approved). **Ready for archive** once the Spec-Drift doc handling and branch handling are chosen.
