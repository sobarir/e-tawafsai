# Brainstorm Summary

- Change: multi-tenancy-foundation
- Date: 2026-07-04
- Status: design CONFIRMED by user (Step 1c passed) — writing Design Doc + Spec Patches

## Confirmed Technical Approach

### D1. Scoping mechanism — CONFIRMED: scoped-repository now, RLS as seam
- `TenantScopedDb` is the ONLY injectable data accessor for tenant-owned tables.
- Reads active `tenantId` from request-scoped context (nestjs-cls / AsyncLocalStorage).
- Auto-applies `WHERE tenant_id = ?` on reads; stamps `tenant_id` on writes.
- Throws loudly if no tenant context is set (C15 "impossible by construction, fails loudly").
- Raw `DB` (unscoped) reserved for: migrations/seed, and the tenant-registry reads (tenants table is NOT tenant-owned). No unscoped auth bootstrap needed (see D2/pipeline).
- RLS deferred as documented seam: non-owner DB role + `tenantOwned()` helper stay RLS-compatible.
- Rationale: postgres.js shared pool makes RLS require per-request tx wrapping + non-owner role + FORCE RLS — real cost for one-live-tenant Phase 1.

### D2. Login + email uniqueness — CONFIRMED: per-tenant composite + host-resolved login
- `users` unique is composite `(tenant_id, email)`; NO global uniques on any tenant-owned table.
- Public login route resolves tenant from trusted request Host (apex/localhost -> default tenant), sets CLS tenant, then `findByEmail` scoped within that tenant.
- Web forwards the browsing Host to the API (ky beforeRequest / X-Forwarded-Host) so public routes resolve; authenticated routes IGNORE Host.

### D3. platform_owner seam — CONFIRMED: separate boolean flag
- `users.is_platform_owner boolean not null default false`, orthogonal to role enum (admin|user).
- RolesGuard unchanged; no cross-tenant behavior wired in Phase 1.

### D4. Request pipeline / context wiring (design decision, no per-request Nest providers)
- `nestjs-cls` ClsMiddleware wraps every request establishing CLS context.
- Active tenant (`cls.tenantId`) set by exactly one resolver per request:
  - Authenticated: `JwtStrategy.validate` sets `cls.tenantId = payload.tenantId` (first line), then scoped `findById` (where tenant_id = payload.tenantId AND id = sub). Tenant reassignment invalidates token (like role freshness). No unscoped auth read.
  - Public: host-resolver middleware/guard sets `cls.tenantId` from resolved Host tenant.
- `TenantScopedDb` is a singleton wrapping the singleton `DB` + `ClsService`; reads tenantId per call, throws if absent.
- JWT payload: `{ sub, email, tenantId }`. `AuthUser` gains `tenantId`.

## Key Trade-offs and Risks
- Scoped-repo depends on discipline (no raw db on tenant tables) -> mitigated by narrow escape-hatch list + verify-time check + loud-failure test.
- CLS lost across async boundaries (jobs/schedulers) -> data layer requires explicit tenant when no ambient context; jobs iterate tenants explicitly.
- Client-forwarded Host header only meaningful for public login; authenticated routes ignore it, so spoofing is inert. Prefer trusted proxy Host/X-Forwarded-Host in prod.
- Pattern drift in later tables -> `tenantOwned()` helper (schema layer, to avoid columns.ts<->tenants cycle) + verify check.

## Testing Strategy
- Unit: resolver (apex->default, known slug->tenant, unknown->404, authed host-override ignored); TenantScopedDb no-context->throws; seam validation (ppiu/revenue_share rejected); tenantOwned shape.
- Integration (test:int): two-tenant fixture, identical slugs -> each context returns only own rows, zero foreign tenantId; unscoped/no-context call fails loudly; seed idempotency (exactly one default tenant); login within tenant A -> tenantId in JWT; token with stale tenant rejected.
- `bun run verify` + `bun run test:int` pass.

## Spec Patches (to write back after user confirms; supplements/clarifications only)
1. multi-tenancy / Mandatory tenant ownership: clarify `users` uniqueness is composite `(tenant_id, email)` as the concrete instance.
2. multi-tenancy / Tenant-scoped authentication: add scenario — token whose tenantId no longer matches user's current tenant is rejected on fresh re-read.
3. multi-tenancy / Seam values rejected: clarify Phase 1 has no tenant HTTP write; validation enforced at the tenant-creation helper (seed/service) layer via Zod refine (agent + subscription only).
4. multi-tenancy / Structural scoping: clarify the unscoped escape-hatch boundary (migrations/seed + tenant-registry reads; tenants table is not tenant-owned).
5. tenant-resolution: clarify API public-route tenant source is trusted request Host / X-Forwarded-Host; web forwards it; authenticated routes ignore Host.
