## ADDED Requirements

### Requirement: Admin-defined categories scoped by provider and product type
The system SHALL provide tenant-scoped CRUD for Package Categories, each scoped by `(providerId, productType)` and carrying `name`, `commissionType` (`flat_per_pax`|`percent_of_price`), and `commissionValue` (integer). A category's `name` SHALL be unique within its `(tenant, provider, productType)` scope on the normalized name (`lower(trim(name))`); the same name MAY exist under a different Provider or product type. Category CRUD SHALL be admin-only (`@Roles("admin")`) and MUST NOT be exposed to `staff` users.

#### Scenario: Create category under a provider and product type
- **WHEN** an admin creates a category named "VIP" under Provider X for `umrah` with a commission
- **THEN** the category is saved scoped to (Provider X, umrah) and appears when listing that provider+type's categories

#### Scenario: Same name allowed across different scope
- **WHEN** an admin creates a category "Regular" under Provider X/umrah and another "Regular" under Provider Y/umrah
- **THEN** both are allowed because the uniqueness scope is `(tenant, provider, productType)`

#### Scenario: Duplicate name within one scope rejected
- **WHEN** an admin creates a second category whose normalized name equals an existing category under the same Provider and product type
- **THEN** the request is rejected with `409 Conflict` and no row is inserted

#### Scenario: Category CRUD is admin-only
- **WHEN** a staff user calls any category create/update/delete endpoint
- **THEN** the API returns `403`

### Requirement: Category owns commission, seeded from the provider default
Each category SHALL own its `commissionType` and `commissionValue`, which are authoritative for that category. When a new category is created without an explicit commission, the system SHALL seed it from the owning Provider's `defaultCommissionType`/`defaultCommissionValue`. Category commission SHALL be admin-only, stripped from any response returned to `staff` users via role-aware response DTOs.

#### Scenario: New category seeded from provider default
- **WHEN** an admin creates a category without specifying commission and the Provider's default is `flat_per_pax` / 500000
- **THEN** the created category's commission is `flat_per_pax` / 500000

#### Scenario: Category commission stripped for staff
- **WHEN** a staff user receives any payload that includes categories
- **THEN** the payload contains no `commissionType`/`commissionValue` keys for those categories

### Requirement: In-use categories cannot be hard-deleted
A category referenced by at least one package SHALL NOT be hard-deleted; the delete request SHALL be rejected with `409 Conflict` naming the blocking usage. Categories with no referencing packages MAY be deleted.

#### Scenario: Delete blocked while packages reference the category
- **WHEN** an admin deletes a category that at least one package uses
- **THEN** the request is rejected with `409 Conflict` and the category is retained

#### Scenario: Unused category deleted
- **WHEN** an admin deletes a category that no package references
- **THEN** the category is removed

### Requirement: Package form category dropdown filtered by provider and product type
The create/edit package form SHALL populate the category selector only with categories belonging to the currently selected Provider and product type. Changing the selected Provider or product type SHALL refresh the available categories.

#### Scenario: Dropdown lists only in-scope categories
- **WHEN** an admin selects Provider X and product type `umrah` in the package form
- **THEN** the category dropdown lists only categories scoped to (Provider X, umrah)

#### Scenario: Changing provider refreshes categories
- **WHEN** the admin changes the selected Provider to Provider Y
- **THEN** the category dropdown reloads with Provider Y's categories for the current product type
