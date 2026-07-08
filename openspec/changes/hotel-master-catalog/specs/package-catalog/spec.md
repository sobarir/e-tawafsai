## MODIFIED Requirements

### Requirement: Package entity with structured fields
The system SHALL provide tenant-scoped CRUD for Packages with: provider ref, `productType` (`umrah`|`haji_khusus`|`haji_furoda`), `title`, per-tenant unique `slug`, `categoryId` (a **nullable** reference to an admin-defined Package Category scoped to the package's Provider and `productType`; required at publish per the Publish validation requirement), `plusDestination` (nullable), `durationDays`, `description`, inclusions/exclusions tags, flyer images, a one-to-many list of hotels stored as links (`hotelId`) to rows in the tenant **Hotel catalog** (each catalog hotel carrying `city`, `name`, `stars`, `distanceM` (nullable), `isPelataran`); a package SHALL NOT reference the same hotel twice, `airlineId` (a **nullable** reference to a tenant Airline master row; required at publish), `flightRoute`, `departureCityId` (a **nullable** reference to a tenant Departure City master row; required at publish), `isFeatured`, `status` (`draft`|`published`|`archived`). The former fixed `category` enum is REPLACED by the `categoryId` reference. The former free-text `airline` and `departureCity` columns are REPLACED by the `airlineId` and `departureCityId` references. The former per-package free-text hotel fields (`cityName`, `name`, `stars`, `distanceM`, `isPelataran`) are REPLACED by the `hotelId` reference to the Hotel catalog. Duration, category, airline, departure city, and hotels SHALL be structured (not free text). When set, an assigned category MUST belong to the package's Provider and `productType`; an assigned `airlineId` / `departureCityId` MUST belong to the package's tenant; an attached `hotelId` MUST belong to the package's tenant.

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

#### Scenario: Attached hotel must belong to the tenant
- **WHEN** a package attaches a `hotelId` that does not belong to the package's tenant
- **THEN** the request is rejected with a field-level error
