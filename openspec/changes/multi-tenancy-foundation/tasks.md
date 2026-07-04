# Tasks: multi-tenancy-foundation

## 1. Schema & seams

- [x] 1.1 Add `TENANT_TYPES`, `TENANT_PLANS`, `TENANT_PLAN_STATUSES` constants + tenant Zod schemas/DTO types to `packages/shared`
- [x] 1.2 Add `tenants` table to `packages/db` (slug unique, enum columns deriving from shared tuples) and a `tenantOwned()` column helper in `columns.ts`
- [x] 1.3 Add non-null `tenantId` FK to `users` (migration: add nullable → backfill to default tenant → NOT NULL)
- [x] 1.4 Generate migration (`db:generate`) and update `db:seed` to idempotently seed the default tenant and attach seeded users

## 2. Scoping mechanism (per design-phase decision)

- [x] 2.1 Spike outcome applied: implement the chosen enforcement (RLS policies + session variable, and/or `TenantScopedDb` accessor) in `apps/api/src/database`
- [x] 2.2 Request-scoped tenant context (nestjs-cls/AsyncLocalStorage) populated by middleware; explicit-tenant API for jobs/scripts with no ambient context
- [x] 2.3 Loud-failure guard: accessing tenant-owned tables without tenant context throws; unit test proves it

## 3. Tenant resolution

- [x] 3.1 Public host → tenant resolver (apex/localhost → default tenant; unknown subdomain → 404)
- [x] 3.2 Authenticated resolution: JWT carries `tenantId`; guards re-read user+tenant fresh per request; client host/params can never override
- [x] 3.3 Web: subdomain-aware tenant resolution seam in `apps/web` (middleware), single-tenant UX unchanged

## 4. Verification

- [x] 4.1 Integration test: two-tenant fixture with identical slugs — each context returns only its own rows, zero foreign `tenantId` in responses
- [x] 4.2 Integration test: unscoped repository call fails loudly
- [ ] 4.3 Unit tests for resolver edge cases (apex, known/unknown subdomain, host-override attempt)
- [ ] 4.4 `bun run verify` and `bun run test:int` pass
