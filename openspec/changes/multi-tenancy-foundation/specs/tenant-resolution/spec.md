# Delta Spec: tenant-resolution

## ADDED Requirements

### Requirement: Subdomain tenant resolution for public traffic
Public (unauthenticated) requests SHALL resolve the active tenant from the request host: `{slug}.domain.tld` resolves to the tenant with that slug; the apex domain (and dev `localhost`) resolves to the default tenant. The resolution layer SHALL exist in Phase 1 even with a single tenant. The API SHALL take the host from the trusted request `Host` / `X-Forwarded-Host` (set by the proxy or forwarded by the web app); the web app derives the slug from its own host and forwards it. This host source applies to public routes only.

#### Scenario: Apex resolves to default tenant
- **WHEN** a public request arrives on the apex domain
- **THEN** the default tenant's context is active for that request

#### Scenario: Subdomain resolves to its tenant
- **WHEN** a public request arrives on `{slug}.domain.tld` for an existing tenant slug
- **THEN** that tenant's context is active and only its data is served

#### Scenario: Unknown subdomain
- **WHEN** a public request arrives on a subdomain matching no tenant slug
- **THEN** the response is 404 and no other tenant's data is served

### Requirement: Authenticated tenant resolution
Authenticated admin/API requests SHALL resolve the active tenant from the authenticated user's `tenantId`, never from client-supplied host headers or parameters.

#### Scenario: Host header cannot override user tenant
- **WHEN** an authenticated user of tenant A sends a request with a host/header referencing tenant B
- **THEN** the request executes under tenant A's scope

### Requirement: Two-tenant isolation fixture
The test suite SHALL include a fixture with two tenants owning identically-slugged resources, proving end-to-end that each resolution path returns only the resolved tenant's rows (PRD C15 acceptance).

#### Scenario: Identical slugs, isolated results
- **WHEN** two test tenants each own a resource slugged `umroh-hemat-9-hari` and each tenant's host is visited
- **THEN** each response contains only that tenant's resource and zero foreign `tenantId` rows
