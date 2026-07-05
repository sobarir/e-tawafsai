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
