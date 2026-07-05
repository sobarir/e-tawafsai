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
