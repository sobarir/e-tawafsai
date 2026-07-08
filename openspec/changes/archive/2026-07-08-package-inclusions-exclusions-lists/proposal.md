## Why

The existing package tag system is unstructured, lacks admin-managed control, and combines inclusions and exclusions into a single list. Transitioning to separate, tenant-global master catalogs for Package Inclusions and Package Exclusions ensures consistent catalog curation, prevents data fragmentation from free-text entries, and simplifies package creation.

## What Changes

* **Database Schemas**:
  * **New Master Tables**: Add `inclusions` and `exclusions` tables, each with tenant scoping, name, and activation status.
  * **New Link Tables**: Add `package_inclusions` and `package_exclusions` tables to establish the relations with packages.
  * **Deletions**: Remove the obsolete `tags` and `package_tags` tables.
* **Backend API**:
  * **CRUD Endpoints**: Create CRUD controllers, modules, and policies for both `inclusions` and `exclusions`.
  * **Package Updates**: Modify the Package endpoints to handle direct assignment of `inclusions` and `exclusions` (arrays of IDs).
  * **Deletions**: Remove old tag-related controllers and endpoints.
* **Shared Types & Schemas**:
  * **Zod Schemas**: Update package payload schemas in `@cometkit/shared` to include `inclusions` and `exclusions` arrays of ULID strings.
  * **DTOs**: Update `PackageDto` to replace `tags: string[]` with separate arrays for inclusions and exclusions.
* **Frontend UI**:
  * **Master Data Settings**: Add "Package Inclusions" and "Package Exclusions" management cards to `/dashboard/settings/master-data` for admin CRUD operations.
  * **Package Creation/Editing**: Revamp the Package details form to replace the tags card with two separate multi-select checkbox grids for Inclusions and Exclusions.

## Capabilities

### Modified Capabilities
* `package-catalog`: Modify the requirement for package tags to instead require two separate, admin-curated lists of Inclusions and Exclusions. Remove the capability to add arbitrary free-text tags during package creation/editing.

## Impact

* **Database**: Requires generating and running migrations to drop `tags` and `package_tags` and create the new master and relationship tables.
* **API Breakage**: External API clients using the old `tags` fields or endpoints will need to transition to the new `inclusions` and `exclusions` properties.
* **Frontend**: UI updates to pages `/dashboard/settings/master-data` and `/dashboard/packages/[id]` to consume the new endpoints and hook structures.
