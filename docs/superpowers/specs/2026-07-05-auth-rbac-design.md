---
comet_change: auth-rbac
role: technical-design
canonical_spec: openspec
archived-with: 2026-07-05-auth-rbac
status: final
---

# Design Doc: auth-rbac

Tenant-scoped RBAC (`admin` / `staff`) on the CometKit starter, built directly
on `multi-tenancy-foundation`. This change **adapts** the starter's existing auth
(JWT via passport-jwt, `JwtAuthGuard` + `RolesGuard` with fresh-per-request role,
`common/password.ts`, the users CRUD worked example) rather than rebuilding it.

Canonical capability specs live in OpenSpec
(`openspec/changes/auth-rbac/specs/{authentication,user-management}/spec.md`).
This doc records the **technical** design and decisions; it does not restate
requirements.

## Scope boundary (what auth-rbac does vs. defers)

**In scope, concretely enforced and tested here:**

- `admin` / `staff` role model from the single shared `USER_ROLES` tuple.
- Admin-only user administration (list / create / update / deactivate /
  reactivate), tenant-scoped; staff → 403.
- Soft deactivation via `isActive`, replacing hard delete; inactive users
  cannot log in and their existing tokens are rejected.
- `waNumber` on users.
- httpOnly-cookie session + server-side route gating; `/register` reduced to a
  placeholder (no open account creation).

**Seamed here, realized in their owning changes** (no runtime surface exists yet):

- *Settings blocked for staff (403)* — no settings controller exists;
  `tenant-settings` adds the route with the `@Roles("admin")` pattern
  established here.
- *Commission fields stripped for staff* — no providers exist;
  `provider-management` builds the generic role-aware field-stripping helper,
  using the staff-DTO convention documented here. **auth-rbac deliberately does
  not build a speculative stripping abstraction with no consumer to test it.**

## Decisions

### D1 — Role tuple rename, not a new column
`USER_ROLES` becomes `["admin","staff"]`. Everything derives from it: the Zod
`z.enum(USER_ROLES)` schemas in shared, the Drizzle `userRoleEnum` pgEnum, the
`@Roles(...)` guards, and the web nav. No parallel role system.

### D2 — Enum migration by value rename
Migrate with `ALTER TYPE user_role RENAME VALUE 'user' TO 'staff'`. On the
repo's target (vanilla PostgreSQL 17+) this is safe and non-blocking, and
renaming the enum value carries all existing rows automatically. The column
default moves `'user'` → `'staff'`.

`drizzle-kit`'s generated SQL from the tuple change would express this as a
drop+recreate of the enum (data loss). **The generated migration is hand-edited**
to the `RENAME VALUE` form. Same migration adds `is_active` and `wa_number`.
Verify the migration against the local Postgres before committing. Fallback (only
if `RENAME VALUE` proves unavailable): create a new enum + swap the column in one
migration.

### D3 — Deactivation = `isActive` boolean, replaces hard delete
Add `isActive boolean NOT NULL DEFAULT true`. The users service's `deleteUser`
(hard `deleteFrom`) is replaced by `deactivateUser` (set `isActive=false`) and
`reactivateUser` (set `true`). No hard-delete endpoint remains — consistent with
the PRD soft-delete NFR.

- Self-deactivation is refused by a pure policy:
  `canDeactivateUser(actor, targetId) = actor.id !== targetId`
  (replaces `canDeleteUser`; same shape, service throws `ForbiddenException`).
- Inactive enforcement in two places:
  - `AuthService.login` rejects inactive users with the standard 401 envelope
    ("Invalid email or password" — do not disclose deactivation).
  - `JwtStrategy.validate` rejects when `!user.isActive` (→ 401), alongside the
    existing "user not found in active tenant" check. This keeps deactivation
    effective against already-issued tokens, mirroring the fresh-role property.

### D4 — Role protection & the deferred stripping seam
- Users controller: `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles("admin")`
  on administration routes; staff-reachable routes use
  `@Roles("admin","staff")`. Role is read fresh from the DB per request (already
  true via `jwt.strategy` → `users.findById`), so downgrades apply immediately.
- **Staff-DTO seam (documentation, not code, in this change):** the convention is
  that any resource with admin-only fields exposes a *distinct staff response
  type* in `packages/shared`, and its mapper takes the viewer role. Users has no
  admin-only field today, so `UserDto` stays single. `provider-management`
  introduces the shared `pickAdminOnly`-style helper and the first real
  admin/staff DTO pair (commission fields).

### D5 — httpOnly-cookie session + server-side gating
Move the session token off localStorage into an httpOnly cookie so Next.js
server middleware can gate routes and the token is not JS-readable.

- **API:** on successful `login`, set the JWT as an httpOnly, `SameSite=Lax`,
  `Secure` (in prod) cookie via `Set-Cookie`, in addition to (or instead of)
  the JSON body. `jwt.strategy` extractor becomes: cookie first, `Authorization:
  Bearer` header as fallback (keeps existing integration tests / API clients
  working). Add `POST /auth/logout` that clears the cookie. CORS must allow
  credentials and be locked to the specific web origin (no wildcard with
  credentials).
- **Web:** `auth-storage.ts` stops using localStorage; the cookie is set by the
  API response, read by `middleware.ts`. The ky client sends
  `credentials: "include"` and drops the manual `Authorization` header. `use-auth`
  derives auth state from a `/auth/me`-style call rather than a local token read.
- **`middleware.ts`:** matches `/dashboard/:path*`, redirects to `/login` when the
  cookie is absent. The API's fresh 401 per request remains the real security
  boundary; middleware is the UX gate + no content flash.

### D6 — `/register` placeholder
Keep the web `/register` route + page as a non-functional access-request /
coming-soon surface (link back to `/login`); do **not** wire open account
creation. Remove `AuthService.register` and the `POST /register` account-creation
route so no account can be self-created. Admins create users via the users
module. True tenant self-signup is a separate later change.

## Components & boundaries

| Unit | Responsibility | Depends on |
| --- | --- | --- |
| `packages/shared` roles/DTOs | `USER_ROLES` tuple, user DTOs (`waNumber`, `isActive`), create/update schemas | — |
| `packages/db` users schema + migration | `is_active`, `wa_number` columns, enum rename | shared |
| `users.policy.ts` | `canDeactivateUser`, `toUserDto` | shared, db types |
| `UsersService` | admin CRUD + deactivate/reactivate, tenant-scoped | `TenantScopedDb`, policy |
| `AuthService` / `JwtStrategy` | login (reject inactive), cookie session, logout, inactive+fresh-role enforcement | UsersService, JwtService |
| web `middleware.ts` + `dashboard/layout.tsx` | server-side gate + role-aware nav | cookie, use-auth |

## Risks / trade-offs

- **Enum rename portability** → mitigated by hand-edited `RENAME VALUE` migration
  verified against local PG17; documented fallback (new enum + swap).
- **Cookie/CORS regressions** → httpOnly cookie requires credentialed CORS locked
  to the web origin; getting this wrong breaks all authenticated calls. Covered by
  an integration test that logs in and hits an authed endpoint via cookie, plus
  keeping the Bearer-header fallback so existing API tests stay green.
- **Deferred stripping forgotten** → the staff-DTO convention is documented here
  and the concrete serialization test ships with `provider-management` where the
  fields exist.

## Testing strategy

- **Unit (`*.spec.ts`, DB-free):** `canDeactivateUser`; `RolesGuard` (staff
  blocked, admin allowed, fresh role); `AuthService.login` rejects inactive;
  `JwtStrategy.validate` rejects `!isActive`.
- **Integration (`*.int.spec.ts`):** staff → 403 on every users-admin endpoint;
  admin create → list → update → deactivate → reactivate round-trip, tenant-scoped
  (rows cleaned up); deactivated user login fails; cookie login → authed request
  succeeds.
- **Gate:** `bun run verify` + `bun run test:int` green.

## Spec Patches written back to OpenSpec delta specs

- `authentication/spec.md`: clarify the "no public self-registration" requirement
  covers open **account creation** (disabled) while the `/register` **page**
  remains as a placeholder; add a **logout** scenario (session cleared) reflecting
  the httpOnly-cookie session.
- `user-management/spec.md`: add a boundary note that the settings-403 and
  commission-stripping scenarios are structurally seamed here and concretely
  enforced in `tenant-settings` / `provider-management`.
