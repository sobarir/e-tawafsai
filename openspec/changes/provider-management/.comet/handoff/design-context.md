# Comet Design Handoff

- Change: provider-management
- Phase: design
- Mode: compact
- Context hash: 51dd601f3adc6e06540dd01dc33e48e4d569d1c62debc4eb73d81037d881caea

Generated-by: comet-handoff.sh

OpenSpec remains the canonical capability spec. This handoff is a deterministic, source-traceable context pack, not an agent-authored summary.

## openspec/changes/provider-management/proposal.md

- Source: openspec/changes/provider-management/proposal.md
- Lines: 1-31
- SHA256: 110c8a41c505e34c47d86a1bef194d16f87897cdf853bb27cafec744cda30b87

```md
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
```

## openspec/changes/provider-management/design.md

- Source: openspec/changes/provider-management/design.md
- Lines: 1-39
- SHA256: 2f56dcb39b46502c11c3357a2c6bee73e9a6d7bd9e6abb238c8dd331dd654fdb

```md
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
```

## openspec/changes/provider-management/tasks.md

- Source: openspec/changes/provider-management/tasks.md
- Lines: 1-23
- SHA256: 47860dea9e98f565c6b6dc3188b5a436c9134d65e059ac434810135714798e46

```md
# Tasks: provider-management

## 1. Contracts & schema

- [ ] 1.1 Shared: `COMMISSION_TYPES`, `ACCREDITATIONS` tuples; provider request schemas + admin/staff response DTOs
- [ ] 1.2 DB: `providers` table (tenant-owned, enums derive from shared), migration, seed demo provider

## 2. API

- [ ] 2.1 Providers module: controller/service/policy per feature pattern; tenant-scoped queries; role-aware mappers
- [ ] 2.2 Activate/deactivate endpoints with license + price-publication-consent validation; deactivation returns affected-packages list and unpublishes in one transaction (interface stub until package-catalog lands)
- [ ] 2.3 Storage seam: upload module (local-disk dev impl behind S3-compatible interface), tenant-prefixed keys; logo upload endpoint

## 3. Web UI

- [ ] 3.1 Provider list + detail + create/edit form (mobile-first), logo upload, activation flow with consent checkbox and deactivation impact dialog
- [ ] 3.2 Staff variant: provider views without commission fields

## 4. Verification

- [ ] 4.1 Unit tests: activation policy (license/consent matrix), commission-field stripping
- [ ] 4.2 Integration test: provider CRUD tenant-scoped; deactivation transaction
- [ ] 4.3 `bun run verify` and `bun run test:int` pass
```

## openspec/changes/provider-management/specs/provider-management/spec.md

- Source: openspec/changes/provider-management/specs/provider-management/spec.md
- Lines: 1-46
- SHA256: 3737c8b752299e8c98fa4a988c66975f13bba2d02d21a8e624b79d737c8cd535

```md
# Delta Spec: provider-management

## ADDED Requirements

### Requirement: Provider registry
The system SHALL provide tenant-scoped CRUD for Providers with: `name`, `brandName`, `ppiuLicenseNo` (nullable), `pihkLicenseNo` (nullable), `accreditation` (`A`|`B`|`C`|`unknown`), `contactPerson`, `contactPhone`, `logoUrl` (nullable), `allowLogoOnPublicPages` (boolean), `defaultCommissionType` (`flat_per_pax`|`percent_of_price`), `defaultCommissionValue`, `commissionNotes` (nullable), `isActive`, price-publication consent, timestamps.

#### Scenario: Create provider draft
- **WHEN** an admin creates a provider with only name and brand name
- **THEN** the provider is saved as inactive and appears in the admin list

### Requirement: Activation requires license and price-publication consent
A Provider SHALL only become active when it has at least one license number (`ppiuLicenseNo` and/or `pihkLicenseNo`) and the D1 confirmation "Partner mengizinkan publikasi harga" has been recorded. Activation state changes SHALL go through explicit activate/deactivate operations.

#### Scenario: Activation blocked without license
- **WHEN** an admin attempts to activate a provider with no license number
- **THEN** the request is rejected with a field-level error

#### Scenario: Activation blocked without price-publication consent
- **WHEN** an admin attempts to activate a provider without confirming price publication permission
- **THEN** the request is rejected and the consent requirement is stated

#### Scenario: Successful activation
- **WHEN** an admin activates a provider with `ppiuLicenseNo` set and consent confirmed
- **THEN** the provider becomes active and the consent timestamp is stored

### Requirement: Deactivation cascade
Deactivating a Provider SHALL auto-unpublish all its published Packages after the admin confirms a dialog listing the affected packages; unpublish and deactivation happen in one transaction. Packages are never deleted by this cascade.

#### Scenario: Deactivate provider with published packages
- **WHEN** an admin deactivates a provider that has published packages and confirms the listed impact
- **THEN** the provider is inactive and all its packages are unpublished atomically

### Requirement: Commission fields are admin-only
Provider commission fields (`defaultCommissionType`, `defaultCommissionValue`, `commissionNotes`) SHALL never be returned to `staff` users nor rendered in staff views, enforced via role-aware response DTOs.

#### Scenario: Staff opens provider detail
- **WHEN** a staff user requests a provider detail
- **THEN** the response body contains no commission keys and the UI renders no commission section

### Requirement: Logo storage
Provider logos SHALL be uploaded through the storage seam under tenant-prefixed paths; `allowLogoOnPublicPages` controls future public rendering (consumed by C6).

#### Scenario: Logo uploaded
- **WHEN** an admin uploads a provider logo
- **THEN** it is stored under the tenant's path prefix and `logoUrl` resolves to it
```

