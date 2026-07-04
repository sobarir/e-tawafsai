# Subagent Progress — multi-tenancy-foundation

Coordinator recovery checkpoint. Does not replace plan/OpenSpec checkboxes.

- build_mode: subagent-driven-development
- tdd_mode: tdd
- isolation: branch (feature/20260704/multi-tenancy-foundation)
- plan: docs/superpowers/plans/2026-07-04-multi-tenancy-foundation.md
- total plan tasks: 14

## ENV NOTE (all dispatches)
bun v1.3.14 is installed at `/c/Users/rahma/.bun/bin/bun.exe` but NOT on the bash PATH.
Every dispatch prompt must instruct the agent to prepend it:
`export PATH="/c/Users/rahma/.bun/bin:$PATH"` before any bun/bunx command.
Do NOT use the PowerShell tool — its shim needs dotnet, which is absent (exit 82). Use bash only.

## ZOD NOTE (all zod-under-vitest tasks: db, api specs)
In files RUN under vitest, import zod as a namespace: `import * as z from "zod"`.
Named `import { z } from "zod"` → `z.object` undefined at runtime under the vitest
transform (both unplugin-swc AND vitest4 Oxc). Verified empirically. Do not "clean up"
namespace zod imports to named form. See memory zod-namespace-import-under-vitest.

## Plan→OpenSpec checkoff map
- T1 → 1.1 ✔ | T2 → 1.2 ✔ | T3 → (sub-step of 1.3, no checkoff) | T4 → 1.3 + 1.4
- T6 → 2.3 | T9 → 2.2 | T11 → 2.1
- T8 → 3.1 | T10 → 3.2 | T13 → 3.3
- T12 → 4.1, 4.2 | T14 → 4.3, 4.4

## Current task
- task: Task 14 — Stale-token int check + resolver edge tests + full gate (FINAL)
- plan-task-text: "## Task 14: Stale-tenant token integration check + full gate"
- openspec-task-text: checks off "4.3 Unit tests for resolver edge cases (apex, known/unknown subdomain, host-override attempt)" AND "4.4 bun run verify and bun run test:int pass" after this task
- stage: task-review (spec + quality)
- base: 2e0a53f (HEAD after Task 13 closeout)
- impl-commit: 8011d2d (tenancy.int.spec +stale-token; tenant-resolution.middleware.spec +3 edge tests; diff review-2e0a53f..8011d2d.diff)
- gate MET (FINAL): bun run verify green (typecheck 0 + lint 0 + unit 12/12); bun run test:int 2 files/6 tests pass, both runs idempotent. noUncheckedIndexedAccess `!` guards applied.
- gate: (1) add stale-tenant-token scenario to tenancy.int.spec.ts (user reassigned A→B; scoped findById under A returns 0 rows). (2) EXPAND to fully cover 4.3: add tenant-resolution.middleware.spec.ts tests for middleware.use() — unknown slug (registry→null) → next(NotFoundException); auth-header present → next() with NO cls.set (host can't override authenticated tenant). (3) FULL gate: `bun run verify` (typecheck+lint+test) AND `bun run test:int` both green. Run test:int twice (idempotent).
- reviews-passed: none
- review-fix-round: 0
- AFTER T14: coordinator does app-boot DI smoke (VERIFY-PHASE GAP), then final whole-branch review, then build→verify guard.

## PROCESS LESSON (apply to T13, T14, and any spec task)
vitest (test:int / test) does NOT typecheck or lint. A spec can pass tests while failing `bun run verify` (tsc + eslint). ALWAYS run `bun run verify` (typecheck+lint+unit) AND `bun run test:int` as the real gate for any task touching apps/api — not just the narrower command the plan step names. Task 12 shipped a TS2532 (`rows[0].tenantId` under noUncheckedIndexedAccess) + 3 unused-import lint errors that test:int never caught; fixed in the T12 fix commit. Full project lint baseline was 3 errors (now 0).

## VERIFY-PHASE GAP — RESOLVED (app-boot DI smoke done after T14 impl)
`bunx nest build` exit 0 → `bun dist/main.js` boots. Probes: /health → 200 (middleware-excluded); GET /users no-auth → 401 (NOT 500 — TenantResolutionMiddleware ran, resolved host→default→CLS, then JwtAuthGuard rejected); POST /auth/login bad body → 400 (Zod validation). No DI/resolve errors in boot log. Proves the full Nest graph (ClsModule, TenancyModule providers/exports, middleware mount, TenantScopedDb injectability) resolves + executes at runtime under Fastify. Process cleaned up (killed :3001).

## apps/api typecheck BASELINE (known cross-task breakage from Task 1's AuthUser/User shape change)
As of HEAD after Task 4, `cd apps/api && bunx tsc --noEmit` has 9 known errors, all "Property 'tenantId'/'isPlatformOwner' is missing", in:
- auth.service.ts (×2), jwt.strategy.ts → fixed by Task 10
- auth.service.spec.ts → fixed by Task 10
- users.service.ts, users.service.int.spec.ts → fixed by Task 11
- roles.guard.spec.ts, users.policy.spec.ts (×2) → ORPHANED (no task owns these specs' mocks). PLAN GAP: fold into Task 10/11 scope or fix at Task 14 verify. Add tenantId/isPlatformOwner to their AuthUser/User mocks.
After Task 10: 5 errors remain, ALL Task 11 scope: users.service.ts, users.service.int.spec.ts, users.policy.spec.ts (x2), AND auth.service.ts:31 (register->create needs create() to drop tenantId requirement). Task 11 must clear all 5.

## Minor findings (defer to final whole-branch review triage)
- T6: `tenant-scoped-db.ts:~79` `and(tenantPredicate, extra) as SQL` — add a source comment (not just report) explaining the cast is safe because and() has ≥1 condition here; a future zero-arg refactor wouldn't be compiler-caught.
- T6: `insertValues`/`update` take `Record<string, unknown>` — widest trust boundary (mistyped columns slip through `as never`). Brief allows it; final review may tighten.
- T11: `users.service.ts` has repeated `as User`/`as User[]` casts because `TenantScopedDb`'s scoped helpers return loosely-typed rows. Related to the T6 generics-tightening item — a potential polish task: add proper table-row generics to TenantScopedDb so callers get typed rows without casts.
- T3: `packages/db/src/schema/users.ts:1` imports `boolean` from `drizzle-orm/pg-core` instead of the `./tenants` re-export Task 2 added for this consumer. Functionally identical; matches the brief's (internally inconsistent) example. Consequence: the `boolean` re-export in `schema/tenants.ts:~30` is currently unused. Final review: either route users.ts import through ./tenants, or drop the unused re-export.

## Completed tasks
- Task 1 — shared tenant contracts (974baa1..3885865; 1 fix round: tsconfig gate + zod namespace import)
- Task 2 — tenants table + tenantOwned() (e99c451; clean)
- Task 3 — users tenant-owned (c6c3206; scope-creep seed.ts reverted; clean after)
