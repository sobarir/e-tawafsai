# Tasks: auth-rbac

## 1. Role model & data

- [x] 1.1 Change `USER_ROLES` to `["admin","staff"]` in `packages/shared`; update dependent types/DTOs; add `waNumber` and `isActive` to user schemas/DTOs
- [x] 1.2 Migration (hand-edited): `ALTER TYPE user_role RENAME VALUE 'user' → 'staff'`; add `is_active` (default true) and `wa_number` columns; change column default to `'staff'`; verify against local PG; update seeds (demo admin + demo staff in default tenant)
- [x] 1.3 Reduce registration to placeholder: remove `POST /register` account-creation + `AuthService.register`; keep web `/register` page as an inert access-request placeholder (no working create form)

## 2. API RBAC & session

- [x] 2.1 Guard users administration endpoints with `@Roles("admin")`; staff-reachable modules use `@Roles("admin","staff")`
- [x] 2.2 Document the staff-DTO seam convention in shared (distinct staff response types + viewer-role mappers); generic stripping helper deferred to `provider-management`
- [x] 2.3 User administration endpoints: list/create/update within tenant; replace hard delete with deactivate/reactivate (`isActive`); `canDeactivateUser` self-guard in `users.policy.ts`
- [x] 2.4 httpOnly-cookie session: set JWT cookie on login (`Set-Cookie`), cookie extractor in `jwt.strategy` (Bearer header fallback), `POST /auth/logout` clears cookie, credentialed CORS locked to web origin
- [ ] 2.5 Inactive enforcement: `login` rejects inactive users (standard 401 envelope); `jwt.strategy.validate` rejects `!isActive`

## 3. Web UI

- [ ] 3.1 User-management screens (list, create, edit name/role/WA, deactivate/reactivate) under dashboard, admin-only navigation, mobile-usable at 380px
- [ ] 3.2 Move token to cookie (`auth-storage` + ky `credentials: "include"`, drop manual Authorization header); `dashboard/layout.tsx` with role-aware nav (no Users entry for staff)
- [ ] 3.3 `middleware.ts` gates `/dashboard/*` server-side via the session cookie; unauthenticated access redirects to `/login`; logout clears session client-side

## 4. Verification

- [ ] 4.1 Unit tests: `canDeactivateUser`, roles guard (fresh role, staff blocked), login rejects inactive, jwt.strategy rejects inactive
- [ ] 4.2 Integration test: staff receives 403 on users endpoints; admin CRUD + deactivate/reactivate round-trip tenant-scoped; deactivated user login fails; cookie login → authed request succeeds
- [ ] 4.3 `bun run verify` and `bun run test:int` pass
