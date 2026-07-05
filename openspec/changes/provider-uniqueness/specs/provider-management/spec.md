## ADDED Requirements

### Requirement: Provider uniqueness per tenant

Within a single tenant, Providers SHALL be unique on two independent keys: the
**normalized name** (`lower(trim(name))`) and the **normalized PPIU license number**
(`trim(ppiuLicenseNo)`, evaluated only when non-empty). A create or update that would
make a Provider's normalized name equal an existing Provider's normalized name in the
same tenant, or its normalized PPIU equal an existing non-empty PPIU in the same tenant,
SHALL be rejected. Uniqueness SHALL be enforced both by a database constraint (the hard
guarantee) and by an application pre-check that returns a `409 Conflict` identifying the
conflicting Provider. Uniqueness is scoped per tenant: the same name or PPIU MAY exist
under different tenants.

#### Scenario: Reject create with duplicate normalized name
- **WHEN** a tenant already has a Provider named "PT Al Hijaz" and an admin creates a Provider named "pt al hijaz " in the same tenant
- **THEN** the request is rejected with `409 Conflict` and the response identifies the existing Provider; no new row is inserted

#### Scenario: Reject create with duplicate PPIU license
- **WHEN** a tenant already has a Provider with PPIU "12345" and an admin creates a Provider with PPIU " 12345 " in the same tenant
- **THEN** the normalized PPIU matches and the request is rejected with `409 Conflict`

#### Scenario: Reject update that collides with another provider
- **WHEN** an admin updates a Provider's name (or PPIU) so its normalized value equals another Provider's in the same tenant
- **THEN** the request is rejected with `409 Conflict` and the Provider is left unchanged

#### Scenario: Blank PPIU never collides
- **WHEN** two Providers in the same tenant have no PPIU (empty or NULL) and different names
- **THEN** both are allowed; blank PPIU values are exempt from the uniqueness rule

#### Scenario: Same name or PPIU allowed across tenants
- **WHEN** tenant A has a Provider with PPIU "12345" and tenant B creates a Provider with PPIU "12345"
- **THEN** tenant B's create succeeds because uniqueness is scoped per tenant

### Requirement: PPIU blank normalization on write

When a Provider is created or updated, an empty or whitespace-only `ppiuLicenseNo` SHALL
be stored as `NULL`, and a non-empty `ppiuLicenseNo` SHALL be stored trimmed. This keeps
blank licenses exempt from the uniqueness constraint and prevents `""`-vs-`NULL` drift.

#### Scenario: Empty PPIU stored as NULL
- **WHEN** an admin saves a Provider with `ppiuLicenseNo` set to `""` or whitespace
- **THEN** the stored value is `NULL`

### Requirement: One-time duplicate merge cleanup

Before the uniqueness constraint takes effect, existing duplicate Providers SHALL be
consolidated per tenant. Providers SHALL be grouped into duplicate clusters by the
transitive closure of shared normalized name OR shared non-empty normalized PPIU within
the same tenant. For each cluster the system SHALL select one canonical survivor —
preferring an active Provider (`isActive = true`), then the earliest-created (lowest
ULID) — repoint every `packages.providerId` from the non-survivors to the survivor, and
delete the non-survivor rows. The survivor SHALL retain its own field values unchanged.
The cleanup SHALL run atomically (one transaction) and complete before the unique indexes
are applied.

#### Scenario: Cluster consolidated to one survivor
- **WHEN** a tenant has Providers A, B, C where A and B share a normalized name and B and C share a normalized PPIU
- **THEN** all three form one cluster, a single survivor is kept (active first, else lowest ULID), and the cluster resolves to that one Provider

#### Scenario: Packages repointed, no orphans
- **WHEN** a non-survivor Provider owns Packages and is merged into the survivor
- **THEN** those Packages' `providerId` is updated to the survivor and no Package is left referencing a deleted Provider

#### Scenario: Survivor selection prefers active
- **WHEN** a cluster contains one active Provider and older inactive Providers
- **THEN** the active Provider is the survivor even if it is not the oldest
