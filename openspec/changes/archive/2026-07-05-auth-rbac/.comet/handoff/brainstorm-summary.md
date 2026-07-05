# Brainstorm Summary

- Change: auth-rbac
- Date: 2026-07-05
- Status: design CONFIRMED by user (Step 1c passed) — writing Design Doc

## Confirmed Decisions (user-approved)

1. **Field-strip mechanism deferred.** auth-rbac ships the role model, guards,
   staff→403 on user administration, deactivation, and `waNumber`. The generic
   "admin-only field" stripping helper is built in `provider-management` (where
   real commission fields exist to test it). auth-rbac only documents the
   staff-DTO convention as a seam.
2. **Deactivation = `isActive` boolean, replaces hard delete.** Add
   `isActive boolean NOT NULL DEFAULT true`. DELETE endpoint becomes
   deactivate/reactivate (toggle). Login and jwt.strategy reject inactive users.
3. **Web auth gate = httpOnly cookie + real middleware.** API sets the JWT as an
   httpOnly cookie on login (`Set-Cookie`); `jwt.strategy` gains a cookie
   extractor; ky client switches to `credentials: "include"`; CORS locks to the
   specific web origin (no `*` with credentials); a `logout` endpoint clears the
   cookie. Server-side `middleware.ts` reads the httpOnly cookie to gate
   `/dashboard` routes. Add a role-aware dashboard nav.
4. **`/register` kept as placeholder.** Web `/register` page stays as a
   non-functional access-request / coming-soon surface; open account creation
   stays DISABLED (no `POST /register` account creation). Preserves the spec's
   "no public self-registration"; real tenant self-signup lands in its own
   change (C16).

## Agent Decisions (technical, not requiring user vote)

- **Enum migration:** `ALTER TYPE user_role RENAME VALUE 'user' TO 'staff'`
  (safe on PG17, carries existing rows). Hand-edit drizzle-generated migration
  (it would otherwise drop/recreate). Column default `'user'` → `'staff'`.
- **Deactivation enforcement:** jwt.strategy.validate rejects `!isActive`;
  login rejects inactive before issuing token.
- **Self-deactivation guard:** policy fn `canDeactivateUser(actor, targetId)`
  = `actor.id !== targetId` (replaces canDeleteUser).
- **Register disabled:** remove `POST /register` route + `auth.service.register`
  + web `/register` page.

## Forward-looking scenarios (seams here, realized in owning changes)

- "Settings blocked for staff (403)" — no settings endpoint exists yet →
  realized in `tenant-settings`. auth-rbac establishes the `@Roles("admin")`
  guard pattern.
- "Commission fields stripped for staff" — no providers exist yet → realized in
  `provider-management`.

## Spec Patch candidates (write back to delta specs, pending confirmation)

- user-management/spec.md: clarify that the "Staff restrictions on settings and
  commission data" requirement's settings-403 and commission-stripping
  scenarios are structurally seamed here and concretely enforced in their owning
  changes (tenant-settings / provider-management). Boundary clarification only —
  no scope rewrite.

## Testing Strategy

- Unit: `canDeactivateUser`, roles guard (fresh role, staff blocked), login
  rejects inactive, jwt.strategy rejects inactive.
- Integration: staff → 403 on users admin endpoints; admin CRUD +
  deactivate/reactivate round-trip, tenant-scoped; deactivated user login fails.
- `bun run verify` + `bun run test:int` green.
