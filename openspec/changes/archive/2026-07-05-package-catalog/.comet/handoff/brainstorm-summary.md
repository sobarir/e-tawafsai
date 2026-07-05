# Brainstorm Summary

- Change: package-catalog
- Date: 2026-07-05

## Confirmed Technical Approach
- **Database Schema**:
  - `packages`: Core package attributes (`productType`, `title`, `slug`, `category`, `plusDestination`, `durationDays`, `description`, `airline`, `flightRoute`, `departureCity`, `isFeatured`, `status`).
  - `package_hotels`: One-to-many relationship storing hotels by city (`cityName`, `name`, `stars`, `distanceM` (nullable), `isPelataran` (boolean)).
  - `tags` & `package_tags`: Scoped per tenant for inclusions/exclusions.
- **Form Design**: Scrolling form with side-by-side flyer upload step. Flyer upload is completely optional and can be skipped. Camera capture uses standard HTML `<input type="file" accept="image/*" capture="environment">`.
- **Slug Lifecycle**: Automatically generated from title in drafts, manually editable, locks upon publication.
- **Publish validation**: Enforced in `packages.policy.ts`:
  - Requires: `durationDays`, `airline`, `departureCity`, `category`, and at least one Makkah hotel.
  - Requires active provider with PPIU license (for `umrah`).
  - If `plusDestination` is set, transit city hotel existence is not required for publication.

## Key Trade-offs and Risks
- **Flexible Hotels**: Storing hotels in a separate table (`package_hotels`) requires coordinating transactions when saving packages.
- **No Cascade Deletion for Tags**: We don't delete `tags` when packages are deleted, keeping them as history/autocomplete for future forms.

## Testing Strategy
- **Unit Tests**:
  - `packages.policy.ts` validation checks (missing Makkah hotel, active provider validation, slug mutation rules).
- **Integration Tests**:
  - Tenant-scoped package CRUD with hotel additions.
  - Cascade unpublish on provider deactivation.

## Spec Patches
- Update delta spec to reflect `package_hotels` one-to-many layout and the Makkah hotel validation rules.
