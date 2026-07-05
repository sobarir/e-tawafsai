# Brainstorm Summary

- Change: provider-management
- Date: 2026-07-05

## Confirmed Technical Approach
- **Database Schema:** Introduce `providers` table under tenant-ownership. Includes accreditation, license numbers, default commission type/value, contact, logo, and activation consent timestamp.
- **Shared DTO Contracts (Approach 1):** Define separate `ProviderDto` (admin-only with commission info) and `StaffProviderDto` (for staff, without commission info). Map explicitly using `toProviderDto` and `toStaffProviderDto` in the service/policy tier.
- **Logo Storage Seam (Option A):** Abstract S3-compatible `StorageService` interface. Write local-disk implementation during development storing files under `apps/api/public/uploads/${tenantId}/${filename}`. Serve directory using Fastify static serving middleware.
- **Cascade Deactivation Stub (Option A):** Create a generic interface `ProviderCascadeService` in the providers module that package-catalog will later implement to unpublish packages on deactivation. Currently mock/stub the dependency.

## Key Trade-offs and Risks
- **Module Coupling / Circular dependencies:** Decoupled packages and providers dependencies by using the `ProviderCascadeService` interface injection token.
- **Commission Data Leaks:** Enforce strict field-stripping in controllers using compile-time DTO mappers instead of decorator-based interceptors.

## Testing Strategy
- **Unit Tests:** Verify activation validation rules (license & price-publication consent check) and DTO mapping logic.
- **Integration Tests:** Verify tenant-scoped CRUD operations and mock cascade unpublish calls on deactivation transactions.

## Spec Patches
- None.
