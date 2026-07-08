## ADDED Requirements

### Requirement: Tenant-global hotel catalog
The system SHALL provide a tenant-scoped `hotels` master table, each row having a `name`, a `city` (free text so Makkah, Madinah, and transit/plus-destination cities are all expressible), `stars` (1–5), `distanceM` (nullable, meters to the Haram), `isPelataran` (boolean), and an `isActive` flag (default true). A hotel SHALL be unique per tenant on the normalized `(lower(btrim(name)), lower(btrim(city)))` pair, so the same hotel name MAY exist in more than one city. This table is the single source of truth for the hotels a Package references.

#### Scenario: Create catalog hotel
- **WHEN** an admin creates a hotel with a name+city pair not already used (normalized) in the tenant
- **THEN** the row is saved as active and becomes available for selection

#### Scenario: Duplicate name+city rejected
- **WHEN** an admin creates a hotel whose normalized name and city already exist together in the tenant
- **THEN** the request is rejected with a field-level conflict error

#### Scenario: Same name allowed across cities
- **WHEN** an admin creates a hotel with a name that already exists in the tenant but for a different city
- **THEN** the row is saved (the uniqueness is on name+city, not name alone)

### Requirement: Admin-only catalog management under Settings
Creating, editing, activating, deactivating, and deleting hotel catalog rows SHALL be restricted to admin users and surfaced under Settings. Because a hotel carries more than a name, the admin form SHALL edit `name`, `city`, `stars`, `distanceM`, and `isPelataran` (not just a name field). The city input SHALL offer the canonical cities Makkah and Madinah as selectable options plus a transit/other escape that accepts a free-text city, so canonical city names are entered consistently (keeping the publish "Makkah hotel" check and the picker's city filter reliable) while transit cities remain expressible. Non-admin users SHALL NOT be able to mutate the catalog.

#### Scenario: Non-admin cannot mutate
- **WHEN** a non-admin user attempts to create or edit a catalog hotel
- **THEN** the request is rejected with a forbidden error

#### Scenario: Admin edits hotel attributes
- **WHEN** an admin edits a catalog hotel's stars or distance
- **THEN** the updated attributes are persisted and reflected wherever the hotel is referenced

#### Scenario: Canonical city entered consistently
- **WHEN** an admin creates a Makkah hotel via the canonical city option
- **THEN** the stored `city` is exactly "Makkah" so the hotel is offered in the Makkah picker and counts toward the publish Makkah-hotel rule

#### Scenario: Transit city via escape
- **WHEN** an admin chooses the transit/other option and enters a free-text city
- **THEN** the hotel is stored with that city and offered in the picker for a package whose plus-destination matches it

### Requirement: Active filtering with assigned-hotel preservation
In the package form's hotel picker, only `isActive` catalog hotels of the chosen city (tenant-scoped) SHALL be offered. When editing a package whose attached hotel has since been deactivated, that hotel SHALL still be shown as attached so the package's value is not silently lost.

#### Scenario: Deactivated hotel hidden from picker
- **WHEN** an admin deactivates a hotel and then opens the package form's picker for that city
- **THEN** the deactivated hotel is absent from the pick list

#### Scenario: Attached deactivated hotel preserved on edit
- **WHEN** an admin edits a package whose attached hotel was deactivated after attachment
- **THEN** the form still shows that hotel as attached and the package keeps it unless detached

### Requirement: Package-hotel link to the catalog
A Package's hotels SHALL be stored as links `{ packageId, hotelId }` to catalog rows, with no per-package hotel attributes. A package SHALL NOT attach the same hotel twice (unique `(packageId, hotelId)`). Attaching a hotel SHALL reference an existing catalog hotel of the package's tenant by `hotelId`; detaching SHALL remove only the link, never the catalog row. The Package DTO's hotel list SHALL expose each attached hotel's `hotelId` alongside its catalog attributes (`cityName` mapped from the catalog `city`, `name`, `stars`, `distanceM`, `isPelataran`) so a client can render, deduplicate the picker against, and detach a specific attachment.

#### Scenario: Attach a catalog hotel
- **WHEN** an admin attaches a hotel to a package by `hotelId`
- **THEN** a link row is created and the package's hotel list includes the catalog hotel's `hotelId` and attributes

#### Scenario: Duplicate attach rejected
- **WHEN** an admin attaches a hotel already attached to the same package
- **THEN** the request is rejected and no second link is created

#### Scenario: Cross-tenant hotel rejected
- **WHEN** an admin attaches a `hotelId` that belongs to another tenant
- **THEN** the request is rejected with a field-level error

#### Scenario: Detach keeps the catalog row
- **WHEN** an admin detaches a hotel from a package
- **THEN** the link is removed and the catalog hotel remains available for other packages

### Requirement: Deletion guarded for in-use hotels
A catalog hotel referenced by any package SHALL NOT be hard-deletable; the delete attempt SHALL be rejected and the admin directed to deactivate instead. Unreferenced hotels MAY be deleted, gated behind the shared confirm dialog.

#### Scenario: Delete blocked when referenced
- **WHEN** an admin deletes a hotel referenced by at least one package
- **THEN** the delete is rejected with an explanatory error and the row is retained

#### Scenario: Unreferenced hotel deletable behind confirm
- **WHEN** an admin confirms deletion of a hotel referenced by no package
- **THEN** the row is removed

### Requirement: Fresh-start migration and demo seed
The change SHALL reshape `package_hotels` into a link table `{ packageId, hotelId }`, dropping the per-package hotel attribute columns (`cityName`, `name`, `stars`, `distanceM`, `isPelataran`). Existing `package_hotels` rows SHALL be cleared without backfill. A demo seed SHALL add a curated set of catalog hotels for the demo/dev tenant and link them to seeded packages so those packages still satisfy publish validation. Real tenants begin with an empty catalog curated through the admin UI.

#### Scenario: Migration clears old rows and drops columns
- **WHEN** the migration runs
- **THEN** `package_hotels` retains only `{ packageId, hotelId }` and no old free-text hotel rows remain

#### Scenario: Demo seed keeps seeded packages publishable
- **WHEN** the demo seed runs
- **THEN** demo packages have at least one attached Makkah catalog hotel and still pass publish validation
