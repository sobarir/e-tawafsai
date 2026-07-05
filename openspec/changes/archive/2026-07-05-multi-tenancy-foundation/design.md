# Design: multi-tenancy-foundation

## Context

The CometKit starter is single-tenant: `users` has no tenant column, services query Drizzle directly, and the web app assumes one brand. PRD C15/D3 requires tenancy to be structural from Phase 1 while UX stays single-tenant (one seeded default tenant, no switcher, no signup). Stack: NestJS API, Next.js web, Drizzle + Postgres, shared Zod contracts (`shared ← db ← api`, `shared ← web`).

## Goals / Non-Goals

**Goals:**
- Tenant entity with the D4/D5/D6 schema seams (tenantType, plan enums) present but inert.
- A scoping mechanism where an unscoped query on tenant-owned tables is impossible by construction and fails loudly in tests (PRD C15 acceptance).
- Per-request tenant context: subdomain for public traffic, JWT-derived for authenticated traffic.
- A documented pattern every later Phase 1 table copies (column, FK, per-tenant unique indexes, storage path prefix).

**Non-Goals:**
- Tenant signup, billing, platform super-admin panel (C16, Phase 4).
- Multi-tenant membership per user; tenant switcher UI.
- Custom domains; more than one live tenant.

## Decisions

*(High-level direction; final selection and details go through `/comet-design` brainstorming.)*

1. **Scoping mechanism — leading candidates:**
   - (a) **Postgres RLS** with `SET LOCAL app.tenant_id` per transaction: enforcement in the database, immune to app-layer mistakes; adds session-management complexity with Drizzle/pooling.
   - (b) **Mandatory scoped-repository pattern**: a `TenantScopedDb` wrapper is the only injectable data access for tenant-owned tables; raw `db` access to those tables is lint/test-guarded.
   - Recommendation to evaluate in design phase: RLS as the enforcement backstop + a thin scoped accessor for ergonomics (defense in depth); decide after spiking Drizzle + RLS with the bun/pg driver.
2. **Tenant context propagation:** NestJS middleware resolves tenant (JWT claim for `/api`, Host header for public routes) into request-scoped context (AsyncLocalStorage/nestjs-cls), consumed by the data layer.
3. **Default tenant seeding** happens in migration/seed (`db:migrate` then `db:seed` order per repo convention); its ULID is stable via a well-known slug lookup, not a hardcoded id.
4. **JWT shape:** token carries `tenantId`; `RolesGuard`/`JwtStrategy` re-read user (and thus tenant) fresh per request, preserving the repo's existing role-freshness behavior.
5. **Per-tenant uniqueness:** composite unique indexes `(tenant_id, slug)` etc.; global uniques on tenant-owned tables are forbidden by the pattern.
6. **Subdomain resolution in dev:** apex (`localhost:3000`) → default tenant; `{slug}.localhost` reserved for the two-tenant isolation test fixture.

## Risks / Trade-offs

- [RLS + connection pooling misconfiguration silently disables policies] → integration test that asserts an unscoped/foreign-tenant query returns zero rows and a dedicated "scoping is structural" test that must fail loudly.
- [Request-scoped context lost across async boundaries (jobs, schedulers)] → data layer requires explicit tenant argument when no ambient context exists; jobs iterate tenants explicitly.
- [Pattern drift in later changes (a new table forgets tenantId)] → schema helper (`tenantOwned()` column group in `packages/db/src/columns.ts`) + verify-time check.
- [Overbuilding for one tenant] → scope strictly to schema + scoping + resolution; no tenant admin UI.

## Migration Plan

1. Add `tenants` table + seed default tenant.
2. Add nullable `tenant_id` to `users` → backfill to default tenant → set NOT NULL + FK (single migration, safe on empty/seed data).
3. Deploy API with tenant context middleware; JWT rollover is acceptable pre-launch (no live users).

## Open Questions

- RLS vs scoped-repository vs both (spike in `/comet-design`).
- Whether `platform_owner` is a `users.role` value or a separate table — decide in design; only the seam is needed now.
