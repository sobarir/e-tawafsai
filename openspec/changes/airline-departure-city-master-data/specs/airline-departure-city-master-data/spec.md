## ADDED Requirements

### Requirement: Tenant-global airline and departure-city master data
The system SHALL provide two tenant-scoped master tables, `airlines` and `departure_cities`, each row having a `name` and an `isActive` flag (default true). Names SHALL be unique per tenant on the normalized form (`lower(btrim(name))`), independent of Provider and product type. These tables are the single source of truth for the airline and departure city a Package references.

#### Scenario: Create airline master row
- **WHEN** an admin creates an airline with a name not already used (normalized) in the tenant
- **THEN** the row is saved as active and becomes available for selection

#### Scenario: Duplicate name rejected
- **WHEN** an admin creates an airline or departure city whose normalized name already exists in the tenant
- **THEN** the request is rejected with a field-level conflict error

### Requirement: Admin-only management under Settings
Creating, editing, activating, and deactivating airline and departure-city master rows SHALL be restricted to admin users and surfaced under Settings. Non-admin users SHALL NOT be able to mutate master data.

#### Scenario: Non-admin cannot mutate
- **WHEN** a non-admin user attempts to create or edit an airline or departure city
- **THEN** the request is rejected with a forbidden error

### Requirement: Active filtering with assigned-row preservation
Only `isActive` master rows SHALL populate the create-package form's airline and departure-city dropdowns. When editing a package whose currently-assigned airline or departure city has since been deactivated, that assigned row SHALL still be shown as the selected option so the package's value is not silently lost.

#### Scenario: Deactivated row hidden from new selections
- **WHEN** an admin deactivates an airline and then creates a new package
- **THEN** the deactivated airline is absent from the airline dropdown

#### Scenario: Assigned deactivated row preserved on edit
- **WHEN** an admin edits a package whose assigned airline was deactivated after assignment
- **THEN** the form still shows that airline as selected and the package keeps it unless changed

### Requirement: Deletion guarded for in-use rows
A master row referenced by any package SHALL NOT be hard-deletable; the delete attempt SHALL be rejected and the admin directed to deactivate instead. Unreferenced rows MAY be deleted.

#### Scenario: Delete blocked when referenced
- **WHEN** an admin deletes an airline referenced by at least one package
- **THEN** the delete is rejected with an explanatory error and the row is retained

### Requirement: Starter seed and one-time backfill of existing values
The change SHALL migrate **every tenant's** existing package free-text `airline` / `departureCity` values onto master rows — for each distinct non-blank value, matching an existing row case-insensitively (on `lower(btrim(name))`) or creating a new master row so no value is lost — then repoint each package to the corresponding foreign key. A blank or null free-text value SHALL leave the package's foreign key null and create no master row. A curated **starter set** of airlines and departure cities SHALL be seeded only for the demo/dev tenant (via the seed script); real tenants begin with only their backfilled values and curate the rest through the admin UI.

#### Scenario: Existing value backfilled without loss
- **WHEN** the migration runs against a package whose free-text airline does not match any existing master row
- **THEN** a master airline row is created from that value and the package references it

#### Scenario: Blank value leaves null reference
- **WHEN** the migration runs against a package whose free-text airline is blank or null
- **THEN** no master row is created for it and the package's `airlineId` stays null

#### Scenario: Case and whitespace variants collapse
- **WHEN** two packages have airline values differing only by letter case or surrounding whitespace
- **THEN** both are backfilled onto the same single master row
