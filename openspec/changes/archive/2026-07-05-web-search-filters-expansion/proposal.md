## Why

The Phase 1 package search screen was de-scoped to a subset of filters (full-text query, max price, minimum duration, direct-only, and seats-available-only). While the API already fully supports all other filter combinations, they are hidden from the Web UI, preventing agents from conducting precise searches (e.g., by occupancy, month range, category, product type, airline, hotel distance/stars, departure city, and provider) at `/dashboard/search`.

## What Changes

- Add UI controls for all remaining search filters to `FilterSheet` (Occupancy, Month From/To, Duration Max, Product Type, Category, Airline, Departure City, Hotel City, Hotel Max Distance, Hotel Min Stars, Provider).
- Populate the Provider dropdown by querying the database using the existing `useProviders` hook.
- Update `ActiveChips` to display and remove all new active filters, resetting their state correctly.
- Bind all new state fields to the `useSearchPackages` query hook, cleaning up any empty/default values before sending requests.

## Capabilities

### New Capabilities
<!-- None -->

### Modified Capabilities
- `package-search`: Expose the full filter set in the Web UI, updating the spec's Phase 1 de-scope note to reflect full UI availability.

## Impact

- `apps/web`: Update `FilterSheet` and `ActiveChips` in `apps/web/src/app/dashboard/search/search-filters.tsx` and `SearchPage` state in `apps/web/src/app/dashboard/search/page.tsx` to handle the additional search parameters.
