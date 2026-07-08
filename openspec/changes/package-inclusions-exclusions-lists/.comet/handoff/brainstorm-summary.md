# Brainstorm Summary

- Change: package-inclusions-exclusions-lists
- Date: 2026-07-08

## Confirmed Technical Approach

*   **Database Schema**:
    *   Create master tables `inclusions` and `exclusions` with columns: `id`, `tenantId`, `name`, `isActive`, and timestamps. Include unique indices on `(tenantId, lower(btrim(name)))`.
    *   Create relationship tables `package_inclusions` and `package_exclusions` using composite primary keys on `(package_id, inclusion_id)` and `(package_id, exclusion_id)`.
    *   Drop the old `tags` and `package_tags` tables.
*   **Database Seeding**:
    *   Seed default Umrah inclusions (Visa, Flight, Muthawif, etc.) and exclusions (Passport, Meningitis Vaccine, Personal expenses, etc.) during `db:seed`.
*   **API & Backend**:
    *   Implement CRUD controllers, services, and policies for inclusions and exclusions.
    *   Implement delete guards: block deletion of inclusions/exclusions that are linked to any packages.
    *   Update `PackagesService` to manage relationship links in create/update methods atomically using `this.db.transaction`.
*   **Frontend UI**:
    *   Update the Master Data settings page `/dashboard/settings/master-data` with two new `MasterList` cards for Inclusions and Exclusions.
    *   Update the Package form page `/dashboard/packages/[id]` by replacing the tags card with two separate multi-select pill button grids (Approach 1) for Inclusions and Exclusions.

## Key Trade-offs and Risks

*   **Data Loss**: The old `tags` table is dropped. We accepted this risk because the tags feature was incomplete and unused.
*   **Delete Safeguards**: Linked inclusions and exclusions cannot be deleted to avoid broken relationship links. Admins must deactivate them instead.

## Testing Strategy

*   Unit tests for inclusions and exclusions policies.
*   Integration tests for inclusions and exclusions CRUD endpoints (checking unique constraints and delete guards).
*   Integration tests for package endpoints (verifying inclusions and exclusions are correctly attached, updated, and retrieved).

## Spec Patches

None.
