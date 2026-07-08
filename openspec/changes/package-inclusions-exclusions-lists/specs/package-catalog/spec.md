## ADDED Requirements

### Requirement: Package Inclusions and Package Exclusions as tenant-global master catalogs
The system SHALL provide separate, tenant-global master catalogs for Package Inclusions and Package Exclusions. Admins SHALL be able to perform CRUD operations (create, rename, toggle active status, and delete) on inclusions and exclusions via settings master-data.

#### Scenario: Admin creates inclusion
- **WHEN** an admin adds a new inclusion with a unique name
- **THEN** it is saved to the tenant's inclusions master catalog

#### Scenario: Admin creates exclusion
- **WHEN** an admin adds a new exclusion with a unique name
- **THEN** it is saved to the tenant's exclusions master catalog

#### Scenario: Unique constraint on name per tenant
- **WHEN** an admin tries to create an inclusion or exclusion with a name that already exists in that tenant (case-insensitive, trimmed)
- **THEN** the request is rejected with a conflict error

### Requirement: Package creation and editing with separate inclusions and exclusions selections
During package creation and editing, the admin user SHALL be able to select multiple active inclusions and exclusions from the respective tenant-global master catalogs. These selections SHALL be saved atomically with the package. Free-text additions during package creation/editing SHALL NOT be allowed.

#### Scenario: Save inclusions and exclusions on package create
- **WHEN** an admin creates a package and selects active inclusions and exclusions
- **THEN** the package is created and successfully linked to those inclusions and exclusions

#### Scenario: Update inclusions and exclusions on package edit
- **WHEN** an admin updates a package's inclusions and exclusions selections
- **THEN** the links are updated to match the new selections

### Requirement: Cascade delete guard on inclusions and exclusions
An inclusion or exclusion that is currently linked to one or more packages SHALL NOT be deleted. The system SHALL reject deletion requests and recommend deactivation instead.

#### Scenario: Prevent deletion of linked inclusion
- **WHEN** an admin attempts to delete an inclusion that is linked to a package
- **THEN** the delete request is rejected with a conflict error

#### Scenario: Prevent deletion of linked exclusion
- **WHEN** an admin attempts to delete an exclusion that is linked to a package
- **THEN** the delete request is rejected with a conflict error

## REMOVED Requirements

### Requirement: Inclusions and exclusions as seeded tag multi-selects
**Reason**: Replaced by separate admin-managed inclusions and exclusions master catalogs to prevent free-text fragmentation and improve structured data consistency.
**Migration**: Dropped the old `tags` and `package_tags` tables. Any seeded or custom tags are superseded by the new `inclusions` and `exclusions` catalogs.
