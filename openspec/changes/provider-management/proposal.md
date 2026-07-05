# Proposal: provider-management

## Why

Every package must be legally attributable to its licensed operator (PPIU/PIHK): the agent is a marketing partner, not the penyelenggara (PRD §2 regulatory, C2). Providers also carry the commission scheme defaults (D2) and the logo/price-publication permissions (D1) that later capabilities depend on.

## What Changes

- Provider CRUD (admin area) with the full domain-model field set: identity (`name`, `brandName`), licensing (`ppiuLicenseNo`, `pihkLicenseNo`, `accreditation`), contact, `logoUrl` + `allowLogoOnPublicPages`, commission defaults (`defaultCommissionType`, `defaultCommissionValue`, `commissionNotes` — admin-only per auth-rbac), `isActive`.
- Activation rules: a Provider requires at least one license number to activate; for umrah packages `ppiuLicenseNo` is the relevant license (PIHK validation activates with C18). Activation additionally requires the D1 confirmation "Partner mengizinkan publikasi harga".
- Deactivating a Provider auto-unpublishes its Packages with a confirmation dialog listing affected packages (rule specified now; package interaction becomes effective once package-catalog lands).
- Logo upload to tenant-prefixed storage.
- All rows tenant-scoped per multi-tenancy-foundation.

## Capabilities

### New Capabilities

- `provider-management`: provider registry with licensing/activation rules, logo & price-publication permissions, commission-scheme defaults with admin-only visibility, and the deactivation→unpublish cascade.

### Modified Capabilities

(none)

## Impact

- `packages/shared`: provider schemas/DTOs (admin + staff variants), `COMMISSION_TYPES`, `ACCREDITATIONS` tuples.
- `packages/db`: `providers` table (tenant-owned), enums.
- `apps/api`: providers module (controller/service/policy), file upload seam for logos.
- `apps/web`: provider list/detail/form screens.
- Depends on: `multi-tenancy-foundation`, `auth-rbac` (role-aware DTOs). Consumed by: `package-catalog`, later C14 commissions.
