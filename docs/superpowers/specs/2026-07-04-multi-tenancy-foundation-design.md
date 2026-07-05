---
comet_change: multi-tenancy-foundation
role: technical-design
canonical_spec: openspec
---

# Multi-Tenancy Foundation — Technical Design

## Context

CometKit ships single-tenant: `users` has no tenant column, services inject a
`@Global` singleton `DB` (a single postgres.js pool, `max: 10`) and query Drizzle
directly, login does a global `findByEmail`, and the JWT payload is `{ sub, email }`
with `JwtStrategy.validate` re-reading the user fresh per request (role freshness).
The web app assumes one brand.

PRD C15/D3 requires tenancy to be **structural from Phase 1** while the UX stays
single-tenant: one seeded default tenant, no switcher, no signup. This design makes
tenant ownership and scoping impossible to bypass by construction, and establishes
the pattern every later Phase 1 table copies — without overbuilding for the single
live tenant.

Dependency direction is unchanged: `shared ← db ← api`, `shared ← web`.

## Goals / Non-Goals

**Goals**
- Tenant entity with D4/D5/D6 schema seams (`tenantType`, `plan`, `planStatus`)
  present but inert (only `agent` + `subscription` accepted by validation).
- A data layer where a query on tenant-owned tables without an active tenant context
  is impossible by construction and **fails loudly** (C15 acceptance).
- Per-request tenant context: Host for public traffic, JWT-derived for authenticated.
- A documented, copyable pattern (column helper, composite uniques, storage prefix,
  escape-hatch boundary) for every later Phase 1 table.

**Non-Goals**
- Tenant signup, billing, platform super-admin panel (Phase 4).
- Multi-tenant membership per user; tenant switcher UI.
- Custom domains beyond a nullable seam column; more than one live tenant.
- Postgres RLS enforcement in Phase 1 (kept as a documented seam — see Decision 1).

## Decisions

### Decision 1 — Scoping mechanism: scoped-repository now, RLS as a seam

`TenantScopedDb` is the **only** injectable data accessor for tenant-owned tables. It
is a singleton wrapping the singleton `DB` plus `ClsService`:

- **reads** auto-apply `WHERE tenant_id = <cls.tenantId>`;
- **writes** auto-stamp `tenant_id = <cls.tenantId>`;
- if no tenant is in context, every operation **throws** (a dedicated
  `TenantContextMissingError` / `InternalServerError`), rather than returning
  cross-tenant rows.

Raw, unscoped `DB` access is reserved for a **narrow, documented escape-hatch list**:

1. migrations and `db:seed`;
2. tenant-registry reads — the `tenants` table is *not* tenant-owned (it is the
   registry that resolution reads to establish context).

No unscoped "auth bootstrap" read is needed (see Decision 4). A verify-time check
flags raw `DB` use against tenant-owned tables outside this list.

**Why not RLS in Phase 1.** With postgres.js and a shared pool, `SET LOCAL
app.tenant_id` is transaction-scoped, so RLS would force every request's queries into
one pinned-connection transaction, require the API to connect as a **non-owner role**
with `FORCE ROW LEVEL SECURITY`, and rework how every service receives its db handle —
real cost for a system with exactly one live tenant. RLS stays a documented seam: the
`tenantOwned()` helper and a future non-owner role are compatible with adding RLS later
with no schema change. The app-layer structural guarantee plus the isolation and
loud-failure tests deliver the C15 acceptance today.

### Decision 2 — Per-tenant email + host-resolved login

`users` uniqueness is composite **`(tenant_id, email)`**. There are **no global uniques
on any tenant-owned table** — `users` being the first such table, this sets the
precedent exceptionlessly.

Login stays a public route but is scoped to the host-resolved tenant: the resolver
establishes `cls.tenantId` from the request Host (apex/`localhost` → default tenant),
then `AuthService.login` does a *scoped* `findByEmail` within that tenant. Login thus
exercises tenant-resolution from day one. The admin panel already lives on the
apex/default-tenant host, so its behavior is unchanged.

### Decision 3 — `platform_owner` seam as an orthogonal flag

`users.is_platform_owner boolean not null default false`, orthogonal to the per-tenant
`role` enum (`admin` | `user`) — a user has a tenant role and *may independently* be a
platform owner. `RolesGuard` is unchanged and no cross-tenant behavior is wired in
Phase 1. This keeps the super-role concept "outside tenant scope" without conflating it
with per-tenant roles, and makes the seam queryable for Phase 4.

### Decision 4 — Request pipeline & context wiring (no per-request Nest providers)

`nestjs-cls` `ClsMiddleware` wraps every request and establishes the CLS context. The
active tenant (`cls.tenantId`) is set by **exactly one resolver per request** — routes
are either JWT-guarded or public, so there is no conflict:

- **Authenticated** (`/api` behind `JwtAuthGuard`): `JwtStrategy.validate` sets
  `cls.tenantId = payload.tenantId` as its first line, then does a scoped `findById`
  (`tenant_id = payload.tenantId AND id = sub`). A user whose tenant changed resolves to
  `null` → `401`, mirroring the existing role-freshness behavior. No unscoped read.
- **Public** (login, future public site): a host-resolver middleware/guard reads the
  **trusted** request `Host` / `X-Forwarded-Host` and sets `cls.tenantId`
  (`{slug}.domain` → that tenant, apex/`localhost` → default tenant, unknown slug →
  `404`).

Because authenticated routes derive tenant solely from the JWT, a client-supplied Host
header is **inert** there and can never override a user's tenant. `TenantScopedDb` reads
`cls.tenantId` per call, so it needs no request-scoped provider (avoids Nest
request-scope overhead).

## Component Boundaries

| Unit | Responsibility | Depends on |
| --- | --- | --- |
| `packages/shared` tenant contracts | `TENANT_TYPES/PLANS/PLAN_STATUSES`, `TenantContext`, `tenantInputSchema` (agent+subscription refine), `AuthUser`/`JwtPayload` tenant fields | zod |
| `packages/db` `tenants` + `tenantOwned()` | tenant table, enum columns from shared tuples, reusable tenant-FK column group, composite unique helpers | shared |
| `TenantScopedDb` (api) | sole scoped accessor for tenant-owned tables; loud failure without context | `DB`, `ClsService` |
| tenant-resolution (api) | Host→tenant for public; JWT→tenant for authenticated; 404 on unknown | `ClsService`, tenant-registry read |
| auth (api) | JWT carries `tenantId`; scoped login/validate | `TenantScopedDb`/users, resolver |
| web seam (`apps/web`) | derive slug from Host, forward to API; admin UX unchanged | ky `api` |

## Data Model

`tenants`
- `id` ULID PK, `name`, `slug` (unique, kebab-case, the subdomain), `tenantType`
  (`agent`|`ppiu` enum), `plan` (`subscription`|`revenue_share` enum), `planStatus`
  (enum), `brandName`, `brandLogoUrl?`, `waNumber?`, `customDomain?`, timestamps.
- Validation (`tenantInputSchema`) accepts only `tenantType = agent`, `plan =
  subscription`; the other values remain defined as schema seams.

`users` (modified)
- add `tenant_id` (ULID FK → `tenants`, not null) via `tenantOwned()`;
- add `is_platform_owner boolean not null default false`;
- email unique becomes composite `(tenant_id, email)` (drop the global unique).

`tenantOwned()` lives in the `packages/db` schema layer (it imports `tenants`), not in
the generic `columns.ts`, to avoid a `columns.ts ↔ tenants` import cycle.

## Migration Plan

Single migration, safe on empty/seed data:
1. create `tenants`;
2. seed the default tenant (well-known slug; ULID resolved via slug lookup, not
   hardcoded; idempotent `onConflict`);
3. add nullable `tenant_id` to `users`; backfill to the default tenant;
4. set `tenant_id NOT NULL` + FK; replace the global email unique with `(tenant_id,
   email)`.

`db:migrate` before `db:seed` (repo rule). `db:seed` idempotently seeds the default
tenant and attaches existing demo users to it. JWT rollover is acceptable pre-launch.

## File Storage

Tenant-owned file uploads are stored under a tenant-prefixed key (`<tenantId>/…`) so
backups/exports are tenant-separable. Phase 1 wires the prefix convention (helper); no
upload feature ships in this change.

## Testing Strategy

**Unit (`*.spec.ts`, DB-free)**
- tenant resolver: apex/`localhost` → default; known slug → its tenant; unknown slug →
  404; authenticated request with a foreign Host → tenant unchanged (JWT wins).
- `TenantScopedDb`: operation with no CLS tenant → throws.
- `tenantInputSchema`: `ppiu` / `revenue_share` rejected; `agent` + `subscription`
  accepted.
- `tenantOwned()` column-group shape.

**Integration (`*.int.spec.ts`, real Postgres via `test:int`; self-cleaning)**
- two-tenant fixture with identically-slugged rows: under tenant A's context, reads
  return only A's rows and **zero** foreign `tenant_id`; symmetric for B.
- unscoped/no-context call on a tenant-owned table fails loudly.
- seed idempotency: running `db:seed` twice leaves exactly one default tenant, existing
  users attached.
- login within tenant A yields a JWT carrying A's `tenantId`; a token whose `tenantId`
  no longer matches the user's current tenant is rejected.

**Gate**: `bun run verify` and `bun run test:int` pass.

## Risks / Trade-offs

- *Scoped-repo relies on discipline (no raw `DB` on tenant tables).* → narrow
  escape-hatch list + verify-time check + loud-failure test.
- *CLS lost across async boundaries (jobs/schedulers).* → the data layer requires an
  explicit tenant argument when no ambient context exists; jobs iterate tenants
  explicitly.
- *Client-forwarded Host on public login.* → only selects which tenant to authenticate
  against (credentials still required); inert on authenticated routes; prefer trusted
  proxy `Host`/`X-Forwarded-Host` in production.
- *Pattern drift in later tables (a new table forgets `tenantId`).* → `tenantOwned()`
  helper + verify-time check.
- *Overbuilding for one tenant.* → strictly schema + scoping + resolution; no tenant
  admin UI, no RLS.

## Spec Patches (written back to OpenSpec delta specs)

Supplements/clarifications only — no structural rewrite of scope:

1. `multi-tenancy` / Mandatory tenant ownership — clarify `users` uniqueness is the
   concrete composite `(tenant_id, email)`.
2. `multi-tenancy` / Tenant-scoped authentication — add scenario: a token whose
   `tenantId` no longer matches the user's current tenant is rejected on fresh re-read.
3. `multi-tenancy` / Seam values rejected — clarify Phase 1 has no tenant HTTP write;
   validation is enforced at the tenant-creation helper (Zod refine).
4. `multi-tenancy` / Structural scoping — clarify the unscoped escape-hatch boundary
   (migrations/seed + tenant-registry reads; `tenants` is not tenant-owned).
5. `tenant-resolution` — clarify the API public-route tenant source is the trusted
   request `Host`/`X-Forwarded-Host`, forwarded by the web app; authenticated routes
   ignore Host.

## Open Questions

None — all resolved during design (scoping mechanism, email/login model,
`platform_owner` representation, context wiring).
