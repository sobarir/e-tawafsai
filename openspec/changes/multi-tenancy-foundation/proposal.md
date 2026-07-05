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
