## MODIFIED Requirements

### Requirement: Staff restrictions on settings and commission data
`staff` users SHALL have no access to Settings and SHALL never receive commission fields — provider commission (`defaultCommissionType`, `defaultCommissionValue`, `commissionNotes`), category-level commission (`commissionType`, `commissionValue` on Package Categories), and future per-package overrides — in any API response. Enforcement SHALL be structural (role-aware response DTOs), not per-handler filtering.

> **Boundary — realized across changes.** auth-rbac establishes the enforcement seams: the `@Roles("admin")` guard pattern (applied to the settings controller when it lands in `tenant-settings`) and the staff-DTO convention (the generic role-aware field-stripping helper and the first commission DTO pair land in `provider-management`). Category-level commission extends the same staff-DTO convention in `provider-category-commission`.

#### Scenario: Commission fields stripped for staff
- **WHEN** a staff user requests a provider detail (once providers exist)
- **THEN** the response contains no commission fields and the UI renders none

#### Scenario: Settings blocked for staff
- **WHEN** a staff user calls any settings endpoint (once settings exist)
- **THEN** the API returns 403

#### Scenario: Category commission stripped for staff
- **WHEN** a staff user receives any response that includes categories
- **THEN** the response contains no category commission fields
