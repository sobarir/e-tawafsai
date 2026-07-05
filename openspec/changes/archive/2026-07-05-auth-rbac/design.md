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
