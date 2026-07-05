# multi-tenancy Specification

## Purpose
TBD - created by archiving change multi-tenancy-foundation. Update Purpose after archive.
## Requirements
### Requirement: Tenant entity with SaaS seams
The system SHALL persist tenants with: `name`, `slug` (subdomain, unique, kebab-case), `tenantType` (`agent` | `ppiu`), `plan` (`subscription` | `revenue_share`), `planStatus` (`trialing` | `active` | `past_due` | `suspended` | `cancelled`), `brandName`, `brandLogoUrl` (nullable), `waNumber` (nullable), `customDomain` (nullable), timestamps. Only `tenantType = agent` and `plan = subscription` SHALL be accepted by validation in Phase 1; the other enum values exist as schema seams only (PRD D4/D5). Phase 1 exposes no tenant HTTP write endpoint, so this validation is enforced at the tenant-creation helper (the shared Zod `tenantInputSchema`, consumed by seeding and any internal creation path).

#### Scenario: Seam values rejected by validation
- **WHEN** a tenant is created (via the seeding/creation helper) specifying `tenantType = ppiu` or `plan = revenue_share`
- **THEN** the creation is rejected with a validation error while the enum values remain defined in the schema

### Requirement: Default tenant seeding
The system SHALL seed exactly one default tenant (well-known slug) during database seeding, and seeding SHALL be idempotent.

#### Scenario: Idempotent seed
- **WHEN** `db:seed` runs twice
- **THEN** exactly one default tenant row exists and existing seeded users belong to it

### Requirement: Mandatory tenant ownership
Every business entity table (starting with `users`; all subsequent catalog/lead/booking tables) SHALL carry a non-null `tenantId` foreign key to `tenants`. Uniqueness constraints on tenant-owned business fields (e.g. slugs, short codes, and the `users` login email) SHALL be composite with `tenantId`, never global. Concretely, `users` email uniqueness SHALL be the composite `(tenantId, email)`.

#### Scenario: Same email in two tenants
- **WHEN** two different tenants each create a user with the same email value
- **THEN** both inserts succeed because email uniqueness is scoped per tenant

#### Scenario: Same slug in two tenants
- **WHEN** two different tenants each create a resource with the same slug value
- **THEN** both inserts succeed because uniqueness is scoped per tenant

#### Scenario: Row without tenant rejected
- **WHEN** an insert into a tenant-owned table omits `tenantId`
- **THEN** the database rejects the write

### Requirement: Structural tenant scoping in the data layer
The data layer SHALL enforce tenant scoping centrally such that a query against tenant-owned tables without an active tenant context is impossible by construction: it MUST fail loudly (guard/exception) rather than return cross-tenant rows. No API response SHALL ever contain another tenant's rows. Unscoped (raw) data access SHALL be confined to a documented boundary: database migrations and seeding, and reads of the tenant registry itself. The `tenants` table is NOT tenant-owned (it is the registry that resolution reads to establish context) and is therefore exempt from tenant scoping.

#### Scenario: Unscoped access fails loudly
- **WHEN** a test deliberately performs a repository call on a tenant-owned table with no tenant context established
- **THEN** the call throws/errors and returns no data

#### Scenario: Cross-tenant isolation
- **WHEN** two tenants each own rows in the same table and a request executes under tenant A's context
- **THEN** query results contain zero rows with tenant B's `tenantId`

### Requirement: Tenant-scoped authentication
Authentication SHALL map each user to exactly one tenant; the issued token/session SHALL carry the tenant association, and per-request authorization SHALL resolve the user's tenant fresh from the database. A `platform_owner` super-role concept SHALL be reserved outside tenant scope (seam only; no cross-tenant behavior in Phase 1).

#### Scenario: Token bound to tenant
- **WHEN** a user of tenant A authenticates and calls an admin API
- **THEN** the request executes under tenant A's scope regardless of any client-supplied tenant identifier

#### Scenario: Stale-tenant token rejected
- **WHEN** a request presents a valid token carrying `tenantId` A but the user's current tenant (read fresh from the database) is no longer A
- **THEN** the request is rejected (401) rather than executing under either tenant's scope

### Requirement: Tenant-prefixed file storage
File uploads for tenant-owned resources SHALL be stored under tenant-prefixed paths so backups and exports are tenant-separable.

#### Scenario: Upload path prefix
- **WHEN** a file is stored for a tenant-owned resource
- **THEN** its storage key begins with that tenant's identifier

