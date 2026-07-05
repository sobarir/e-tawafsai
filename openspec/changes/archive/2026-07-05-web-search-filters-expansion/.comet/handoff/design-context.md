# Comet Design Handoff

- Change: web-search-filters-expansion
- Phase: design
- Mode: compact
- Context hash: 28c03879e3ec6b8bd215674b2389d814a13a84b9c0867cf774d685ecba6b997a

Generated-by: comet-handoff.sh

OpenSpec remains the canonical capability spec. This handoff is a deterministic, source-traceable context pack, not an agent-authored summary.

## openspec/changes/web-search-filters-expansion/proposal.md

- Source: openspec/changes/web-search-filters-expansion/proposal.md
- Lines: 1-22
- SHA256: d82e83934b1336178b04b9d9eca6d497526403352f343c70bc8a9bb09e9d3cde

```md
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
```

## openspec/changes/web-search-filters-expansion/design.md

- Source: openspec/changes/web-search-filters-expansion/design.md
- Lines: 1-35
- SHA256: d9de2f98d95a3655ba4a42f7e4c1b8d0556b0ccb6f7ea0eea583ad714014508d

```md
## Context

The backend `searchPackagesSchema` supports a rich set of query parameters, but the Web UI currently only exposes `q`, `maxPrice`, `durationMin`, `directOnly`, and `seatsAvailableOnly`. We need to add the remaining parameters to the frontend interface to allow fully leveraging the API's capabilities.

## Goals / Non-Goals

**Goals:**
- Implement React UI inputs for all remaining parameters: `occupancy`, `monthFrom`, `monthTo`, `durationMax`, `category`, `productType`, `airline`, `departureCity`, `providerId`, `hotelCity`, `maxDistanceM`, and `minStars`.
- Fetch active providers to populate a dropdown for `providerId`.
- Ensure clean serialization of parameters (removing empty strings and converting numeric inputs correctly).
- Update the chips display to handle the new filter types gracefully.

**Non-Goals:**
- Multi-select capability (standard single-select/value inputs are sufficient).
- Saving or persistent bookmarking of search queries.

## Decisions

1. **Logical UI Grouping in FilterSheet**:
   The sheet will be structured into clear visual sections using Tailwind or vanilla CSS to maintain readability on mobile (380px):
   - **General**: Max Price + Occupancy selector, Duration (Min / Max), Direct flight only, Seats available only.
   - **Catalog Details**: Product Type, Category, Airline, Departure City.
   - **Hotel Criteria**: City (Makkah/Madinah), Max Distance (meters), Min Stars (1-5).
   - **Provider**: Select dropdown populated from the API.

2. **Fetching Providers**:
   We will load the active provider list using the existing `useProviders` hook (requesting a page size of 100 to get all of them) inside the `FilterSheet` (or passing it from the parent page).

3. **Query Cleansing**:
   Ensure that any filter set to `undefined`, `""`, or default values (e.g. `directOnly = false`, `seatsAvailableOnly = false`) is deleted from the parameters before passing them to `useSearchPackages` to keep the URL/query state clean.

## Risks / Trade-offs

- [Layout Overflow on Mobile] → Mitigate by wrapping the `FilterSheet` inputs in a scrollable container (`overflow-y-auto max-h-[80vh]`) so it remains functional and looks great on small viewports.
- [Zod Validation Errors on Backend] → Mitigate by strictly coercing number inputs (like `maxPrice`, `durationMin`, `durationMax`, `maxDistanceM`, and `minStars`) to actual JavaScript numbers or `undefined` (never empty strings) before calling the API.
```

## openspec/changes/web-search-filters-expansion/tasks.md

- Source: openspec/changes/web-search-filters-expansion/tasks.md
- Lines: 1-14
- SHA256: 8eb91db6efe97cdb3bcc77f58f364f7ca414d781f05306dffb39a040c7b8e6ea

```md
## 1. Web UI Form Expansion

- [ ] 1.1 Fetch active providers list using the existing `useProviders` hook inside the search page context.
- [ ] 1.2 Expose UI controls for occupancy, month range, category, product type, airline, departure city, provider, and hotel filters (city, max distance, min stars) in the `FilterSheet`.
- [ ] 1.3 Update the `ActiveChips` component to display human-readable labels for the new filters and allow removing them individually.

## 2. State & Query Integration

- [ ] 2.1 Update parameter parsing to correctly coerce numeric fields (price, duration, maxDistanceM, minStars) and clean up empty strings or falsey defaults.
- [ ] 2.2 Bind the updated state parameters to the `useSearchPackages` hook, validating that the client-to-API search works without Zod validation failures.

## 3. Verification

- [ ] 3.1 Run `bun run verify` to check type safety, linting, and vitest runs.
```

## openspec/changes/web-search-filters-expansion/specs/package-search/spec.md

- Source: openspec/changes/web-search-filters-expansion/specs/package-search/spec.md
- Lines: 1-20
- SHA256: 7d70f942159e7c3e00dd4ad4ec571837291bb9383b72d90f01659ac27f9983c1

```md
## MODIFIED Requirements

### Requirement: Combined-filter search with departure semantics
The admin search SHALL combine filters — max price (quad by default, occupancy selectable), departure month/date range, duration range, category, airline, direct-only, hotel max distance (Makkah and/or Madinah), min stars, departure city, provider, seats-available-only — and SHALL return only packages having at least one departure satisfying all departure-level predicates (`open`/`almost_full`, date in range, price within budget, seats available when toggled). Direct-only filters on an explicit `packages.directOnly` boolean. The max-price predicate compares against the selected occupancy's price, falling back to `priceQuad` when that occupancy's price is null. All queries are tenant-scoped. The admin search screen surfaces all of these filter controls.

#### Scenario: PRD acceptance filter combination
- **WHEN** the agent searches duration 9, max price 30,000,000, month September
- **THEN** results contain only packages with `durationDays = 9` having ≥1 open September departure with `priceQuad ≤ 30,000,000`

#### Scenario: Seats-available-only toggle
- **WHEN** the toggle is on and a package's only matching departure has `seatAvailable = 0`
- **THEN** that package is excluded

#### Scenario: Direct-only filter
- **WHEN** the direct-only toggle is on
- **THEN** results contain only packages with `directOnly = true`

#### Scenario: Occupancy price fallback
- **WHEN** the max-price filter selects triple occupancy and a matching departure has `priceTriple = null`
- **THEN** the price predicate for that departure compares the max price against `priceQuad`
```

