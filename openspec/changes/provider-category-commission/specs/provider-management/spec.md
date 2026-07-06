## MODIFIED Requirements

### Requirement: Commission fields are admin-only
Provider commission fields (`defaultCommissionType`, `defaultCommissionValue`, `commissionNotes`) SHALL never be returned to `staff` users nor rendered in staff views, enforced via role-aware response DTOs. The Provider `defaultCommissionType`/`defaultCommissionValue` SHALL serve as the seed/default used to prefill the commission of a newly created Package Category for that Provider; the operative commission for a package is carried by its category, not the Provider. Category-level commission fields SHALL be admin-only under the same role-aware DTO rules.

#### Scenario: Staff opens provider detail
- **WHEN** a staff user requests a provider detail
- **THEN** the response body contains no commission keys and the UI renders no commission section

#### Scenario: Provider default seeds a new category
- **WHEN** an admin adds a category for a Provider and does not override the commission
- **THEN** the new category's commission is prefilled from the Provider's `defaultCommissionType`/`defaultCommissionValue`
