# Design: provider-management

## Context

First pure-domain CRUD after the foundation changes; copies the structure of the users worked example (`apps/api/src/users`, `apps/web/src/app/dashboard/users`) per `docs/FEATURE_PATTERN.md`. Providers are referenced by packages (C3), commission entries (C14), and public legality blocks (C6) — this change owns the fields, not those consumers.

## Goals / Non-Goals

**Goals:**
- Tenant-scoped provider registry following the repo's feature pattern (Zod in shared, table in db, typed mappers, policies).
- Activation as an explicit state transition with validation (license + D1 price-publication consent), not a free boolean.
- Commission fields structurally invisible to staff (uses auth-rbac's role-aware DTO pattern — first real consumer).

**Non-Goals:**
- Public display of provider identity (C6); PIHK-specific publish validation (C18); commission computation (C14); provider self-service (C17).

## Decisions

*(Direction; finalized in `/comet-design`.)*

1. **Activation transition endpoint** (`POST providers/:id/activate` / `deactivate`) instead of PATCHing `isActive`: validation (license present, `allowPricePublication` consent recorded) lives in the service; deactivation returns the affected-packages list for the confirmation dialog and performs unpublish in one transaction.
2. **D1 consent as a stored field** (`pricePublicationConsentAt` timestamp) rather than a transient checkbox — auditability of the partnership precondition.
3. **Logo upload** goes through a storage seam (local-disk impl for dev, S3-compatible interface) established here and reused by package flyers in C3; keys tenant-prefixed per C15.
4. **Commission value representation:** single numeric column + type enum (`flat_per_pax` in IDR minor units; `percent_of_price` in basis points) — avoids float money math; exact representation confirmed in design phase.
5. **Deactivation cascade** is a service-level transaction (unpublish packages, never delete); the packages side ships with package-catalog, guarded by a feature-boundary interface so this change compiles before C3 exists.

## Risks / Trade-offs

- [Cascade rule spans two changes (providers ↔ packages)] → specify the rule here, implement the package side in package-catalog against an interface owned here; integration test added when C3 lands.
- [Money-as-float mistakes] → integer minor units/basis points + unit-tested conversion helpers.
- [Commission leak to staff on a future endpoint] → staff DTO type contains no commission keys (type-level guarantee) + serialization test.

## Migration Plan

Additive migration (`providers` table + enums). No backfill needed.

## Open Questions

- Accreditation display values (A/B/C/unknown) — confirm against current Kemenag terminology during design.
