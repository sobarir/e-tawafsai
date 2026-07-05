# Delta Spec: user-management

## ADDED Requirements

### Requirement: Roles admin and staff
The system SHALL enforce exactly two tenant-scoped roles from the shared `USER_ROLES` tuple: `admin` (full access within the tenant) and `staff` (operational access only). The Drizzle enum, API guards, and web UI SHALL all derive from the shared tuple.

#### Scenario: Role source of truth
- **WHEN** the role enum is inspected in shared constants, DB schema, and guards
- **THEN** all derive from the single `USER_ROLES` tuple with values `admin` and `staff`

### Requirement: Admin-only user administration
Only `admin` users SHALL list, create, edit (name, role, WA number), and deactivate users, always within their own tenant. Admins SHALL NOT be able to deactivate themselves.

#### Scenario: Staff blocked from user administration
- **WHEN** a staff user calls any users administration endpoint or opens the users screen
- **THEN** the API returns 403 and the web UI does not offer the navigation entry

#### Scenario: Admin manages users in own tenant only
- **WHEN** an admin lists users
- **THEN** only users with the admin's `tenantId` are returned

#### Scenario: Self-deactivation prevented
- **WHEN** an admin attempts to deactivate their own account
- **THEN** the request is rejected with a clear error

### Requirement: Staff restrictions on settings and commission data
`staff` users SHALL have no access to Settings and SHALL never receive provider commission fields (`defaultCommissionType`, `defaultCommissionValue`, `commissionNotes`, and future per-package overrides) in any API response. Enforcement SHALL be structural (role-aware response DTOs), not per-handler filtering.

> **Boundary — realized across changes.** auth-rbac establishes the enforcement seams: the `@Roles("admin")` guard pattern (applied to the settings controller when it lands in `tenant-settings`) and the staff-DTO convention (the generic role-aware field-stripping helper and the first commission DTO pair land in `provider-management`). The two scenarios below are therefore verified in those owning changes, once a settings endpoint and providers exist.

#### Scenario: Commission fields stripped for staff
- **WHEN** a staff user requests a provider detail (once providers exist)
- **THEN** the response contains no commission fields and the UI renders none

#### Scenario: Settings blocked for staff
- **WHEN** a staff user calls any settings endpoint (once settings exist)
- **THEN** the API returns 403

### Requirement: User management UI
The dashboard SHALL provide an admin-only user-management UI: list with role/status, create user with initial password and role, edit role/name/WA number, deactivate/reactivate — usable on a 380px viewport.

#### Scenario: Create staff user
- **WHEN** an admin creates a user with role `staff`
- **THEN** the user appears in the list and can log in with the initial password

#### Scenario: Deactivated user cannot log in
- **WHEN** a deactivated user attempts login
- **THEN** authentication fails with the standard error envelope
