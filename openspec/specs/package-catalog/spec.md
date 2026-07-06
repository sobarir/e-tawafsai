# package-catalog Specification

## Purpose
TBD - created by archiving change package-catalog. Update Purpose after archive.
## Requirements
### Requirement: Package entity with structured fields
The system SHALL provide tenant-scoped CRUD for Packages with: provider ref, `productType` (`umrah`|`haji_khusus`|`haji_furoda`), `title`, per-tenant unique `slug`, `categoryId` (a **nullable** reference to an admin-defined Package Category scoped to the package's Provider and `productType`; required at publish per the Publish validation requirement), `plusDestination` (nullable), `durationDays`, `description`, inclusions/exclusions tags, flyer images, structured hotel fields stored in a one-to-many list by city (`cityName`, `name`, `stars`, `distanceM` (nullable), `isPelataran` (boolean)), `airline`, `flightRoute`, `departureCity`, `isFeatured`, `status` (`draft`|`published`|`archived`). The former fixed `category` enum (`regular`|`plus`|`private_vip`|`ramadan`|`arbain`|`other`) is REPLACED by the `categoryId` reference. Duration, category, airline, departure city, and hotel fields SHALL be structured (not free text). When set, an assigned category MUST belong to the package's Provider and `productType`.

#### Scenario: Create draft package
- **WHEN** an admin creates a package with title and provider only
- **THEN** it is saved as `draft` and listed in the admin catalog

#### Scenario: Only umrah creatable in Phase 1
- **WHEN** a package create/update specifies `productType` other than `umrah`
- **THEN** the request is rejected (enum seam exists; unlock ships with C18)

#### Scenario: Category must match provider and product type
- **WHEN** a package create/update sets a `categoryId` whose category is not scoped to the package's Provider and `productType`
- **THEN** the request is rejected with a field-level error

#### Scenario: Draft may have no category
- **WHEN** an admin saves a package as a draft without a `categoryId`
- **THEN** the draft is saved with a null category and remains editable (publish will later require a category)

### Requirement: Flyer-first entry flow
The create flow SHALL start with flyer image upload step (multi-image, drag-drop, mobile camera capture) rendered side-by-side with the entry form; flyer upload is optional and can be skipped. Original flyers SHALL remain attached to the package and viewable in the admin package page. Flyers are stored under tenant-prefixed paths.

#### Scenario: Flyer attached and viewable
- **WHEN** the agent uploads a flyer and completes the form
- **THEN** the package exists with the flyer viewable on its admin page

#### Scenario: Upload failure degrades gracefully
- **WHEN** flyer upload fails
- **THEN** the form remains usable and the package can be saved as draft without images

### Requirement: Inclusions and exclusions as seeded tag multi-selects
Inclusions/exclusions SHALL be tag-style multi-selects seeded per tenant with common values (visa, tiket PP, hotel, makan 3x, bus AC, muthawif, perlengkapan umrah, asuransi, handling, airport tax, kereta cepat Haramain) and SHALL allow free-text additions that become tenant tags.

#### Scenario: Free-text tag added
- **WHEN** the agent types a new inclusion not in the seeded list
- **THEN** it is saved as a tenant tag and offered in future selections

### Requirement: Slug generation and immutability
Slugs SHALL be auto-generated from the title (kebab-case), editable while never-published, unique per tenant (collision gets a suffix), and immutable after first publish.

#### Scenario: Slug collision within tenant
- **WHEN** two packages in one tenant would produce the same slug
- **THEN** the second receives a deterministic suffix and both persist

### Requirement: Publish validation
Publishing SHALL be blocked with field-level errors unless: `durationDays`, at least one Makkah hotel, `airline`, `departureCity`, and a valid `categoryId` (referencing a category scoped to the package's Provider and `productType`) are present, and the package's Provider is active with the license required by the `productType` (umrah → `ppiuLicenseNo`). Drafts MAY be incomplete. Only `published` packages are ever exposed publicly (consumed by later changes). Transit hotels and flyer uploads are optional.

#### Scenario: Publish blocked on missing Makkah hotel
- **WHEN** the agent publishes a package missing a Makkah hotel
- **THEN** publish is rejected with a field-level error naming the missing field

#### Scenario: Publish blocked on inactive provider
- **WHEN** the agent publishes a package whose provider is inactive
- **THEN** publish is rejected with an explanatory error

#### Scenario: Publish blocked on missing category
- **WHEN** the agent publishes a package without a `categoryId`
- **THEN** publish is rejected with a field-level error naming the missing category

### Requirement: Provider deactivation unpublishes packages
When a Provider is deactivated (per provider-management's cascade), its published Packages SHALL transition to `draft` (unpublished) in the same transaction.

#### Scenario: Cascade unpublish
- **WHEN** a provider with 3 published packages is deactivated with confirmation
- **THEN** all 3 packages become unpublished atomically

### Requirement: Active-only provider selection in package form

The package create/edit form SHALL offer only **active** providers in the
"Licensed Provider" selection. When editing an existing package whose assigned
provider is inactive, that provider SHALL remain selectable so the current
assignment is preserved; all other inactive providers SHALL be excluded. For a
new package, the default-selected provider SHALL be the first active provider.

#### Scenario: New package lists only active providers
- **WHEN** an admin opens the create package form and there are both active and inactive providers
- **THEN** the Licensed Provider dropdown lists only the active providers
- **AND** the pre-selected provider is the first active provider

#### Scenario: Editing preserves an inactive assigned provider
- **WHEN** an admin edits a package whose assigned provider has since been deactivated
- **THEN** the Licensed Provider dropdown still includes that assigned provider (shown selected)
- **AND** no other inactive provider appears in the dropdown

#### Scenario: No active providers available
- **WHEN** an admin opens the create package form and every provider is inactive
- **THEN** the Licensed Provider dropdown offers no provider options
- **AND** no inactive provider is auto-selected

