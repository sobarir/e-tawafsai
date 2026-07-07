## MODIFIED Requirements

### Requirement: Package entity with structured fields
The system SHALL provide tenant-scoped CRUD for Packages with: provider ref, `productType` (`umrah`|`haji_khusus`|`haji_furoda`), `title`, per-tenant unique `slug`, `categoryId` (a **nullable** reference to an admin-defined Package Category scoped to the package's Provider and `productType`; required at publish per the Publish validation requirement), `plusDestination` (nullable), `durationDays`, `description`, inclusions/exclusions tags, flyer images, structured hotel fields stored in a one-to-many list by city (`cityName`, `name`, `stars`, `distanceM` (nullable), `isPelataran` (boolean)), `airlineId` (a **nullable** reference to a tenant Airline master row; required at publish), `flightRoute`, `departureCityId` (a **nullable** reference to a tenant Departure City master row; required at publish), `isFeatured`, `status` (`draft`|`published`|`archived`). The former fixed `category` enum is REPLACED by the `categoryId` reference. The former free-text `airline` and `departureCity` columns are REPLACED by the `airlineId` and `departureCityId` references. Duration, category, airline, departure city, and hotel fields SHALL be structured (not free text). When set, an assigned category MUST belong to the package's Provider and `productType`; an assigned `airlineId` / `departureCityId` MUST belong to the package's tenant.

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

#### Scenario: Airline and departure city must belong to the tenant
- **WHEN** a package create/update sets an `airlineId` or `departureCityId` that does not belong to the package's tenant
- **THEN** the request is rejected with a field-level error

#### Scenario: Draft may have no airline or departure city
- **WHEN** an admin saves a package as a draft without an `airlineId` or `departureCityId`
- **THEN** the draft is saved and remains editable (publish will later require both)

### Requirement: Publish validation
Publishing SHALL be blocked with field-level errors unless: `durationDays`, at least one Makkah hotel, a valid `airlineId`, a valid `departureCityId`, and a valid `categoryId` (referencing a category scoped to the package's Provider and `productType`) are present, and the package's Provider is active with the license required by the `productType` (umrah → `ppiuLicenseNo`). Drafts MAY be incomplete. Only `published` packages are ever exposed publicly (consumed by later changes). Transit hotels and flyer uploads are optional.

#### Scenario: Publish blocked on missing Makkah hotel
- **WHEN** the agent publishes a package missing a Makkah hotel
- **THEN** publish is rejected with a field-level error naming the missing field

#### Scenario: Publish blocked on inactive provider
- **WHEN** the agent publishes a package whose provider is inactive
- **THEN** publish is rejected with an explanatory error

#### Scenario: Publish blocked on missing category
- **WHEN** the agent publishes a package without a `categoryId`
- **THEN** publish is rejected with a field-level error naming the missing category

#### Scenario: Publish blocked on missing airline or departure city
- **WHEN** the agent publishes a package without an `airlineId` or `departureCityId`
- **THEN** publish is rejected with a field-level error naming the missing field
