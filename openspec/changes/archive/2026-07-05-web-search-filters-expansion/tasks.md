## 1. Web UI Form Expansion

- [x] 1.1 Fetch active providers list using the existing `useProviders` hook inside the search page context.
- [x] 1.2 Expose UI controls for occupancy, month range, category, product type, airline, departure city, provider, and hotel filters (city, max distance, min stars) in the `FilterSheet`.
- [x] 1.3 Update the `ActiveChips` component to display human-readable labels for the new filters and allow removing them individually.

## 2. State & Query Integration

- [x] 2.1 Update parameter parsing to correctly coerce numeric fields (price, duration, maxDistanceM, minStars) and clean up empty strings or falsey defaults.
- [x] 2.2 Bind the updated state parameters to the `useSearchPackages` hook, validating that the client-to-API search works without Zod validation failures.

## 3. Verification

- [x] 3.1 Run `bun run verify` to check type safety, linting, and vitest runs.
