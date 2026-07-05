# Comet Design Handoff

- Change: multi-tenancy-foundation
- Phase: design
- Mode: compact
- Context hash: 5957b7464e00f4078fe8051c2544c52c0be0844a048609573ec9ed9720775dc3

Generated-by: comet-handoff.sh

OpenSpec remains the canonical capability spec. This handoff is a deterministic, source-traceable context pack, not an agent-authored summary.

## openspec/changes/multi-tenancy-foundation/proposal.md

- Source: openspec/changes/multi-tenancy-foundation/proposal.md
- Lines: 1-34
- SHA256: 5fe53f447457bc0dd1246956cd06f5031214abc3685ee87a61106656545e564f

```md
# Proposal: multi-tenancy-foundation

## Why

e-Tawafsai is architected as a multi-tenant SaaS (PRD D3): the product owner is tenant #1 and other umrah sales agents onboard later (Phase 4). Retrofitting tenancy after real catalog/lead data exists is the single most expensive migration this product could face, so tenancy must be structural in the schema and data layer from Phase 1 (PRD C15) — even while the UX behaves exactly as single-tenant.

## What Changes

- Add a `tenants` table (name, slug/subdomain, tenantType `agent`|`ppiu`, plan enum seams per D4/D5, planStatus, brand fields, waNumber) and seed a single default tenant at deploy/migrate time.
- Add mandatory `tenantId` to every business entity, starting with the existing `users` table; all future Phase 1 tables (providers, packages, departures, settings) adopt the same column + pattern.
- Introduce a central tenant-scoping mechanism in the data layer (exact mechanism — Postgres RLS vs mandatory scoped-repository pattern — decided in design) such that an unscoped query on tenant-owned tables is impossible by construction and fails loudly in tests.
- Add tenant resolution: public/web requests resolve tenant by subdomain (`{slug}.domain.tld`), apex domain resolves to the default tenant; authenticated API requests resolve tenant from the user's `tenantId`. The resolution layer exists now even with one tenant.
- Authentication maps a user to exactly one tenant; reserve a `platform_owner` super-role concept outside tenant scope (seam only — no cross-tenant features in this change).
- Uniqueness rules become per-tenant, not global: slugs, short-link codes, file storage path prefixes (pattern established here; applied by later changes).
- **BREAKING**: `users` gains a non-null `tenantId`; login/JWT payload and request context carry the tenant.

## Capabilities

### New Capabilities

- `multi-tenancy`: tenant entity, mandatory tenant ownership of business rows, structural tenant scoping in the data layer, per-tenant uniqueness rules, default-tenant seeding.
- `tenant-resolution`: resolving the active tenant per request — subdomain for public routes (apex → default tenant), authenticated user's tenant for admin/API routes; unresolvable tenant yields 404, never data from another tenant.

### Modified Capabilities

(none — no main specs exist yet in `openspec/specs/`)

## Impact

- `packages/db`: new `tenants` schema, `tenantId` column + FK on `users`, seed update, migration.
- `packages/shared`: tenant types/enums (`TENANT_TYPES`, `TENANT_PLANS`), auth payload shape gains tenant context.
- `apps/api`: request-scoped tenant context (middleware/CLS), scoped data-access layer or RLS session setup, JWT strategy update, integration tests proving cross-tenant isolation and loud failure of unscoped access.
- `apps/web`: subdomain-aware tenant resolution seam for the (future) public site; admin continues single-tenant UX.
- All subsequent Phase 1 changes (auth-rbac, provider-management, package-catalog, departure-inventory, package-search, tenant-settings) depend on this change's pattern.
```

## openspec/changes/multi-tenancy-foundation/design.md

- Source: openspec/changes/multi-tenancy-foundation/design.md
- Lines: 1-50
- SHA256: 338f499d3fb1439571c2362851f6db1e29baa69c049a491f633347bb89bae0ee

```md
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
```

## openspec/changes/multi-tenancy-foundation/tasks.md

- Source: openspec/changes/multi-tenancy-foundation/tasks.md
- Lines: 1-27
- SHA256: 8d8f164057c47514b2b0729de0039009509e9c08f321b8625642f963b1a7d543

```md
# Tasks: multi-tenancy-foundation

## 1. Schema & seams

- [ ] 1.1 Add `TENANT_TYPES`, `TENANT_PLANS`, `TENANT_PLAN_STATUSES` constants + tenant Zod schemas/DTO types to `packages/shared`
- [ ] 1.2 Add `tenants` table to `packages/db` (slug unique, enum columns deriving from shared tuples) and a `tenantOwned()` column helper in `columns.ts`
- [ ] 1.3 Add non-null `tenantId` FK to `users` (migration: add nullable → backfill to default tenant → NOT NULL)
- [ ] 1.4 Generate migration (`db:generate`) and update `db:seed` to idempotently seed the default tenant and attach seeded users

## 2. Scoping mechanism (per design-phase decision)

- [ ] 2.1 Spike outcome applied: implement the chosen enforcement (RLS policies + session variable, and/or `TenantScopedDb` accessor) in `apps/api/src/database`
- [ ] 2.2 Request-scoped tenant context (nestjs-cls/AsyncLocalStorage) populated by middleware; explicit-tenant API for jobs/scripts with no ambient context
- [ ] 2.3 Loud-failure guard: accessing tenant-owned tables without tenant context throws; unit test proves it

## 3. Tenant resolution

- [ ] 3.1 Public host → tenant resolver (apex/localhost → default tenant; unknown subdomain → 404)
- [ ] 3.2 Authenticated resolution: JWT carries `tenantId`; guards re-read user+tenant fresh per request; client host/params can never override
- [ ] 3.3 Web: subdomain-aware tenant resolution seam in `apps/web` (middleware), single-tenant UX unchanged

## 4. Verification

- [ ] 4.1 Integration test: two-tenant fixture with identical slugs — each context returns only its own rows, zero foreign `tenantId` in responses
- [ ] 4.2 Integration test: unscoped repository call fails loudly
- [ ] 4.3 Unit tests for resolver edge cases (apex, known/unknown subdomain, host-override attempt)
- [ ] 4.4 `bun run verify` and `bun run test:int` pass
```

## openspec/changes/multi-tenancy-foundation/specs/multi-tenancy/spec.md

- Source: openspec/changes/multi-tenancy-foundation/specs/multi-tenancy/spec.md
- Lines: 1-61
- SHA256: ba79bc3354f4e1c1043636e1430b2fb11f0eb3cd9b444d0830973558333dee1e

```md
# Delta Spec: multi-tenancy

## ADDED Requirements

### Requirement: Tenant entity with SaaS seams
The system SHALL persist tenants with: `name`, `slug` (subdomain, unique, kebab-case), `tenantType` (`agent` | `ppiu`), `plan` (`subscription` | `revenue_share`), `planStatus` (`trialing` | `active` | `past_due` | `suspended` | `cancelled`), `brandName`, `brandLogoUrl` (nullable), `waNumber` (nullable), `customDomain` (nullable), timestamps. Only `tenantType = agent` and `plan = subscription` SHALL be accepted by validation in Phase 1; the other enum values exist as schema seams only (PRD D4/D5). Phase 1 exposes no tenant HTTP write endpoint, so this validation is enforced at the tenant-creation helper (the shared Zod `tenantInputSchema`, consumed by seeding and any internal creation path).

#### Scenario: Seam values rejected by validation
- **WHEN** a tenant is created (via the seeding/creation helper) specifying `tenantType = ppiu` or `plan = revenue_share`
- **THEN** the creation is rejected with a validation error while the enum values remain defined in the schema

### Requirement: Default tenant seeding
The system SHALL seed exactly one default tenant (well-known slug) during database seeding, and seeding SHALL be idempotent.

#### Scenario: Idempotent seed
- **WHEN** `db:seed` runs twice
- **THEN** exactly one default tenant row exists and existing seeded users belong to it

### Requirement: Mandatory tenant ownership
Every business entity table (starting with `users`; all subsequent catalog/lead/booking tables) SHALL carry a non-null `tenantId` foreign key to `tenants`. Uniqueness constraints on tenant-owned business fields (e.g. slugs, short codes, and the `users` login email) SHALL be composite with `tenantId`, never global. Concretely, `users` email uniqueness SHALL be the composite `(tenantId, email)`.

#### Scenario: Same email in two tenants
- **WHEN** two different tenants each create a user with the same email value
- **THEN** both inserts succeed because email uniqueness is scoped per tenant

#### Scenario: Same slug in two tenants
- **WHEN** two different tenants each create a resource with the same slug value
- **THEN** both inserts succeed because uniqueness is scoped per tenant

#### Scenario: Row without tenant rejected
- **WHEN** an insert into a tenant-owned table omits `tenantId`
- **THEN** the database rejects the write

### Requirement: Structural tenant scoping in the data layer
The data layer SHALL enforce tenant scoping centrally such that a query against tenant-owned tables without an active tenant context is impossible by construction: it MUST fail loudly (guard/exception) rather than return cross-tenant rows. No API response SHALL ever contain another tenant's rows. Unscoped (raw) data access SHALL be confined to a documented boundary: database migrations and seeding, and reads of the tenant registry itself. The `tenants` table is NOT tenant-owned (it is the registry that resolution reads to establish context) and is therefore exempt from tenant scoping.

#### Scenario: Unscoped access fails loudly
- **WHEN** a test deliberately performs a repository call on a tenant-owned table with no tenant context established
- **THEN** the call throws/errors and returns no data

#### Scenario: Cross-tenant isolation
- **WHEN** two tenants each own rows in the same table and a request executes under tenant A's context
- **THEN** query results contain zero rows with tenant B's `tenantId`

### Requirement: Tenant-scoped authentication
Authentication SHALL map each user to exactly one tenant; the issued token/session SHALL carry the tenant association, and per-request authorization SHALL resolve the user's tenant fresh from the database. A `platform_owner` super-role concept SHALL be reserved outside tenant scope (seam only; no cross-tenant behavior in Phase 1).

#### Scenario: Token bound to tenant
- **WHEN** a user of tenant A authenticates and calls an admin API
- **THEN** the request executes under tenant A's scope regardless of any client-supplied tenant identifier

#### Scenario: Stale-tenant token rejected
- **WHEN** a request presents a valid token carrying `tenantId` A but the user's current tenant (read fresh from the database) is no longer A
- **THEN** the request is rejected (401) rather than executing under either tenant's scope

### Requirement: Tenant-prefixed file storage
File uploads for tenant-owned resources SHALL be stored under tenant-prefixed paths so backups and exports are tenant-separable.

#### Scenario: Upload path prefix
- **WHEN** a file is stored for a tenant-owned resource
- **THEN** its storage key begins with that tenant's identifier
```

## openspec/changes/multi-tenancy-foundation/specs/tenant-resolution/spec.md

- Source: openspec/changes/multi-tenancy-foundation/specs/tenant-resolution/spec.md
- Lines: 1-32
- SHA256: 74c89014521ead4a8289a97c9251677f10775a8f196a5ea7e52ceb3f91e2fa93

```md
# Delta Spec: tenant-resolution

## ADDED Requirements

### Requirement: Subdomain tenant resolution for public traffic
Public (unauthenticated) requests SHALL resolve the active tenant from the request host: `{slug}.domain.tld` resolves to the tenant with that slug; the apex domain (and dev `localhost`) resolves to the default tenant. The resolution layer SHALL exist in Phase 1 even with a single tenant. The API SHALL take the host from the trusted request `Host` / `X-Forwarded-Host` (set by the proxy or forwarded by the web app); the web app derives the slug from its own host and forwards it. This host source applies to public routes only.

#### Scenario: Apex resolves to default tenant
- **WHEN** a public request arrives on the apex domain
- **THEN** the default tenant's context is active for that request

#### Scenario: Subdomain resolves to its tenant
- **WHEN** a public request arrives on `{slug}.domain.tld` for an existing tenant slug
- **THEN** that tenant's context is active and only its data is served

#### Scenario: Unknown subdomain
- **WHEN** a public request arrives on a subdomain matching no tenant slug
- **THEN** the response is 404 and no other tenant's data is served

### Requirement: Authenticated tenant resolution
Authenticated admin/API requests SHALL resolve the active tenant from the authenticated user's `tenantId`, never from client-supplied host headers or parameters.

#### Scenario: Host header cannot override user tenant
- **WHEN** an authenticated user of tenant A sends a request with a host/header referencing tenant B
- **THEN** the request executes under tenant A's scope

### Requirement: Two-tenant isolation fixture
The test suite SHALL include a fixture with two tenants owning identically-slugged resources, proving end-to-end that each resolution path returns only the resolved tenant's rows (PRD C15 acceptance).

#### Scenario: Identical slugs, isolated results
- **WHEN** two test tenants each own a resource slugged `umroh-hemat-9-hari` and each tenant's host is visited
- **THEN** each response contains only that tenant's resource and zero foreign `tenantId` rows
```

