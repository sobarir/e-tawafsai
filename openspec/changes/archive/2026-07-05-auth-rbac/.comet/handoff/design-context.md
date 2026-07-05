# Comet Design Handoff

- Change: auth-rbac
- Phase: design
- Mode: compact
- Context hash: a995b7bc1b5197e67933884d313effacc239ec65f7d35bd1f2cb751cbca9657f

Generated-by: comet-handoff.sh

OpenSpec remains the canonical capability spec. This handoff is a deterministic, source-traceable context pack, not an agent-authored summary.

## openspec/changes/auth-rbac/proposal.md

- Source: openspec/changes/auth-rbac/proposal.md
- Lines: 1-33
- SHA256: 5419b316d0e0e4b894310107f80401b558399874505a5abfee716df2694d5831

```md
# Proposal: auth-rbac

## Why

The agent needs secure login and a role model so assistants can help with data entry and lead follow-up without touching settings, user administration, or provider commission data (PRD C1). The user decided (open question 1) to ship the full user-management UI in Phase 1, not just the schema.

## What Changes

- Repurpose the starter's auth for e-Tawafsai roles: `USER_ROLES` becomes `admin` | `staff` (**BREAKING**: replaces the starter's `admin` | `user` enum; migration remaps existing rows).
- Tenant-scoped RBAC on top of multi-tenancy-foundation: users belong to one tenant; role checks and user administration operate within the tenant.
- Role-based access rules: `staff` has no access to Users administration, Settings, or any Provider commission field (`defaultCommissionType`, `defaultCommissionValue`, `commissionNotes` — enforced at the API serialization layer so later changes inherit it).
- Full user-management UI (admin-only): list, create (with role), edit name/role, deactivate; adapted from the starter's user-management worked example.
- All `/admin`-area web routes and non-public API routes require authentication; unauthenticated access redirects to login.
- `waNumber` field added to users (PRD domain model).

## Capabilities

### New Capabilities

- `authentication`: email+password login, session/JWT management, unauthenticated-access behavior, tenant-bound tokens.
- `user-management`: admin-only user CRUD within a tenant, role assignment, and the staff-restriction rules (no Users/Settings access; commission fields never serialized to staff).

### Modified Capabilities

(none — no main specs exist yet)

## Impact

- `packages/shared`: `USER_ROLES` tuple change, user DTOs gain `waNumber`, role-aware response schemas.
- `packages/db`: `user_role` pgEnum migration (`user` → `staff` remap), `waNumber` column.
- `apps/api`: roles guard/decorator updates, field-level serialization guard for admin-only fields, users module adaptation.
- `apps/web`: login flow unchanged; dashboard user-management screens role-gated; staff sees restricted navigation.
- Depends on: `multi-tenancy-foundation` (tenantId on users, tenant context).
```

## openspec/changes/auth-rbac/design.md

- Source: openspec/changes/auth-rbac/design.md
- Lines: 1-42
- SHA256: 7a4f1389942ae19251611528b9a05873304cf3a8e75d1b689cac9c00b13799fc

```md
# Design: auth-rbac

## Context

The starter already ships JWT auth (passport-jwt), `JwtAuthGuard` + `RolesGuard` (role read fresh from DB per request), `@Roles()` decorator, password hashing in `common/password.ts`, and a users CRUD worked example with policies (`users.policy.ts`). This change adapts, not rebuilds. It sits directly on multi-tenancy-foundation: users carry `tenantId` and all queries are tenant-scoped.

## Goals / Non-Goals

**Goals:**
- `admin`/`staff` role model with tenant-scoped user administration and full admin UI.
- A single reusable mechanism for "admin-only fields" so C2's commission fields (and later C14's) are stripped for staff by construction, not per-handler discipline.
- Preserve the starter's security properties: fresh role per request, one password-hashing site, error envelope.

**Non-Goals:**
- `platform_owner` behavior (seam reserved in multi-tenancy-foundation; built in Phase 4).
- Invitations by email/WA, password reset flows (Phase 2+ if needed; admin sets initial passwords).
- Multi-tenant membership.

## Decisions

*(Direction; finalized in `/comet-design`.)*

1. **Role tuple change over new column:** rename `user` → `staff` in `USER_ROLES`; pgEnum migration uses value rename (ALTER TYPE ... RENAME VALUE), avoiding a second role system.
2. **Admin-only field stripping at the mapper layer:** the repo's typed-mapper convention (`toUserDto`-style) gains role-aware variants (e.g. `toProviderDto(row, viewerRole)`); a shared helper marks admin-only keys so omission is type-checked. Response shapes for staff are distinct types in `packages/shared` — the API cannot leak fields that aren't in the staff DTO type.
3. **Route protection:** `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles("admin")` on Users and Settings controllers; staff-accessible modules use `@Roles("admin", "staff")`. Web middleware redirects unauthenticated users to `/login` for all dashboard routes.
4. **User deactivation** (soft) instead of delete, consistent with the PRD's soft-delete NFR; deactivated users fail login and token refresh.
5. **Registration route:** the starter's public `/register` becomes seed/admin-only user creation — open signup contradicts the single-tenant Phase 1 model (tenant signup arrives in C16).

## Risks / Trade-offs

- [pgEnum value rename varies by Postgres version/driver] → verify in migration against the repo's Postgres; fallback strategy: new enum + column swap in one migration.
- [Field-stripping forgotten on a future endpoint] → staff DTO types in shared + a serialization test asserting `commissionNotes` never appears for staff on any provider endpoint.
- [Disabling /register breaks starter e2e flows] → update seeds and affected specs in the same change.

## Migration Plan

1. Ship after multi-tenancy-foundation is archived (needs `tenantId` + tenant context).
2. Single migration: enum value remap + `wa_number` column; seed update (demo admin + demo staff in default tenant).

## Open Questions

- Whether staff can see bookings' price fields (yes per PRD — only commission fields are restricted); confirm exact admin-only field list during design.
```

## openspec/changes/auth-rbac/tasks.md

- Source: openspec/changes/auth-rbac/tasks.md
- Lines: 1-27
- SHA256: 0f962a3e5e58dcec8bd35a222e56d02e05b3d65974474d70450d371be80664ba

```md
# Tasks: auth-rbac

## 1. Role model & data

- [ ] 1.1 Change `USER_ROLES` to `["admin","staff"]` in `packages/shared`; update dependent types/DTOs; add `waNumber` and `isActive` to user schemas/DTOs
- [ ] 1.2 Migration (hand-edited): `ALTER TYPE user_role RENAME VALUE 'user' → 'staff'`; add `is_active` (default true) and `wa_number` columns; change column default to `'staff'`; verify against local PG; update seeds (demo admin + demo staff in default tenant)
- [ ] 1.3 Reduce registration to placeholder: remove `POST /register` account-creation + `AuthService.register`; keep web `/register` page as an inert access-request placeholder (no working create form)

## 2. API RBAC & session

- [ ] 2.1 Guard users administration endpoints with `@Roles("admin")`; staff-reachable modules use `@Roles("admin","staff")`
- [ ] 2.2 Document the staff-DTO seam convention in shared (distinct staff response types + viewer-role mappers); generic stripping helper deferred to `provider-management`
- [ ] 2.3 User administration endpoints: list/create/update within tenant; replace hard delete with deactivate/reactivate (`isActive`); `canDeactivateUser` self-guard in `users.policy.ts`
- [ ] 2.4 httpOnly-cookie session: set JWT cookie on login (`Set-Cookie`), cookie extractor in `jwt.strategy` (Bearer header fallback), `POST /auth/logout` clears cookie, credentialed CORS locked to web origin
- [ ] 2.5 Inactive enforcement: `login` rejects inactive users (standard 401 envelope); `jwt.strategy.validate` rejects `!isActive`

## 3. Web UI

- [ ] 3.1 User-management screens (list, create, edit name/role/WA, deactivate/reactivate) under dashboard, admin-only navigation, mobile-usable at 380px
- [ ] 3.2 Move token to cookie (`auth-storage` + ky `credentials: "include"`, drop manual Authorization header); `dashboard/layout.tsx` with role-aware nav (no Users entry for staff)
- [ ] 3.3 `middleware.ts` gates `/dashboard/*` server-side via the session cookie; unauthenticated access redirects to `/login`; logout clears session client-side

## 4. Verification

- [ ] 4.1 Unit tests: `canDeactivateUser`, roles guard (fresh role, staff blocked), login rejects inactive, jwt.strategy rejects inactive
- [ ] 4.2 Integration test: staff receives 403 on users endpoints; admin CRUD + deactivate/reactivate round-trip tenant-scoped; deactivated user login fails; cookie login → authed request succeeds
- [ ] 4.3 `bun run verify` and `bun run test:int` pass
```

## openspec/changes/auth-rbac/specs/authentication/spec.md

- Source: openspec/changes/auth-rbac/specs/authentication/spec.md
- Lines: 1-47
- SHA256: 0166188e30618836f2ba82b852f0d0a5097a124f472e86c27bc3e97781b53d8e

```md
# Delta Spec: authentication

## ADDED Requirements

### Requirement: Email+password authentication with tenant-bound sessions
The system SHALL authenticate users by email+password, issue a session token bound to the user's tenant, and hash passwords only via the single common hashing module. The session token SHALL be delivered as an httpOnly cookie so it is not readable by client JavaScript; a logout endpoint SHALL clear that cookie.

#### Scenario: Successful login
- **WHEN** a user submits valid credentials
- **THEN** a token is issued carrying the user's id, role, and tenant association, set as an httpOnly session cookie

#### Scenario: Invalid credentials
- **WHEN** a user submits an unknown email or wrong password
- **THEN** the response is 401 with the standard error envelope and no token

#### Scenario: Logout clears the session
- **WHEN** a signed-in user logs out
- **THEN** the session cookie is cleared and subsequent requests without a valid session receive 401

### Requirement: Authenticated access to admin area
All admin/dashboard routes (web) and all non-public API routes SHALL be inaccessible without authentication; unauthenticated web access redirects to login.

#### Scenario: Unauthenticated admin route access
- **WHEN** an unauthenticated request targets any admin/dashboard route
- **THEN** the web user is redirected to login and API requests receive 401

### Requirement: Fresh role and account status per request
Authorization SHALL read the user's role, active status, and tenant fresh from the database on every request, so role changes and deactivation apply to existing tokens immediately.

#### Scenario: Deactivated user with valid token
- **WHEN** a user is deactivated and then uses a previously issued valid token
- **THEN** the request is rejected with 401/403

#### Scenario: Role downgrade applies immediately
- **WHEN** an admin is changed to staff and reuses an existing token on an admin-only route
- **THEN** the request is rejected with 403

### Requirement: No public self-registration in Phase 1
The system SHALL NOT offer public self-registration of accounts; users are created by a tenant admin (or seed). Tenant signup is deferred to the SaaS phase. The `/register` web route MAY remain as a non-functional placeholder (access-request / coming-soon surface) that does not create accounts.

#### Scenario: Account creation disabled
- **WHEN** an unauthenticated request attempts to create a new account via registration
- **THEN** the request is rejected and no user is created

#### Scenario: Register page is an inert placeholder
- **WHEN** an unauthenticated visitor opens the `/register` page
- **THEN** the page renders as an access-request placeholder and offers no working account-creation form
```

## openspec/changes/auth-rbac/specs/user-management/spec.md

- Source: openspec/changes/auth-rbac/specs/user-management/spec.md
- Lines: 1-49
- SHA256: 7b4075ff55bf7baf5c994933c5eead692246e3b1f1886c4c9915e23fee8a2742

```md
# Delta Spec: user-management

## ADDED Requirements

### Requirement: Roles admin and staff
The system SHALL enforce exactly two tenant-scoped roles from the shared `USER_ROLES` tuple: `admin` (full access within the tenant) and `staff` (operational access only). The Drizzle enum, API guards, and web UI SHALL all derive from the shared tuple.

#### Scenario: Role source of truth
- **WHEN** the role enum is inspected in shared constants, DB schema, and guards
- **THEN** all derive from the single `USER_ROLES` tuple with values `admin` and `staff`

### Requirement: Admin-only user administration
Only `admin` users SHALL list, create, edit (name, role, WA number), and deactivate users, always within their own tenant. Admins SHALL NOT be able to deactivate themselves.

#### Scenario: Staff blocked from user administration
- **WHEN** a staff user calls any users administration endpoint or opens the users screen
- **THEN** the API returns 403 and the web UI does not offer the navigation entry

#### Scenario: Admin manages users in own tenant only
- **WHEN** an admin lists users
- **THEN** only users with the admin's `tenantId` are returned

#### Scenario: Self-deactivation prevented
- **WHEN** an admin attempts to deactivate their own account
- **THEN** the request is rejected with a clear error

### Requirement: Staff restrictions on settings and commission data
`staff` users SHALL have no access to Settings and SHALL never receive provider commission fields (`defaultCommissionType`, `defaultCommissionValue`, `commissionNotes`, and future per-package overrides) in any API response. Enforcement SHALL be structural (role-aware response DTOs), not per-handler filtering.

> **Boundary — realized across changes.** auth-rbac establishes the enforcement seams: the `@Roles("admin")` guard pattern (applied to the settings controller when it lands in `tenant-settings`) and the staff-DTO convention (the generic role-aware field-stripping helper and the first commission DTO pair land in `provider-management`). The two scenarios below are therefore verified in those owning changes, once a settings endpoint and providers exist.

#### Scenario: Commission fields stripped for staff
- **WHEN** a staff user requests a provider detail (once providers exist)
- **THEN** the response contains no commission fields and the UI renders none

#### Scenario: Settings blocked for staff
- **WHEN** a staff user calls any settings endpoint (once settings exist)
- **THEN** the API returns 403

### Requirement: User management UI
The dashboard SHALL provide an admin-only user-management UI: list with role/status, create user with initial password and role, edit role/name/WA number, deactivate/reactivate — usable on a 380px viewport.

#### Scenario: Create staff user
- **WHEN** an admin creates a user with role `staff`
- **THEN** the user appears in the list and can log in with the initial password

#### Scenario: Deactivated user cannot log in
- **WHEN** a deactivated user attempts login
- **THEN** authentication fails with the standard error envelope
```

