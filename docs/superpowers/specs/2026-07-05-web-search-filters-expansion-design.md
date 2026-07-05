---
comet_change: web-search-filters-expansion
role: technical-design
canonical_spec: openspec
---

# Design: web-search-filters-expansion

## Context

The backend search API for packages and departures supports a wide range of filters (such as occupancy, month range, category, product type, airline, departure city, provider, and hotel facets). However, the Web UI currently only exposes a small subset of these filters. We need to implement UI controls for all remaining parameters to allow admin agents to perform advanced searches.

## Goals / Non-Goals

**Goals:**
- Implement all remaining search parameters in the Web UI: `occupancy`, `monthFrom`, `monthTo`, `durationMax`, `category`, `productType`, `airline`, `departureCity`, `providerId`, `hotelCity`, `maxDistanceM`, and `minStars`.
- Dynamically populate the provider dropdown using the database by calling the `useProviders` hook.
- Render active chips for all search filters with human-readable labels, resolving the provider ID to its brand name.
- Cast numeric filter values correctly to prevent API Zod validation failures.

**Non-Goals:**
- Creating saved searches or alerts.
- Multi-select capability for filters (single select is sufficient).

## Decisions

1. **State Buffering in FilterSheet**:
   The sheet will use a local state copy `localFilters` to track input changes. The main page filters will only update when the "Terapkan" (Apply) button is clicked. This prevents unnecessary refetches while typing or selecting inputs.

2. **Logical Visual Sections**:
   Organize inputs in `FilterSheet` using clear headings:
   - **General Search**: Max Price, Occupancy, Duration (Min/Max), Dates (Month From/To).
   - **Catalog Settings**: Product Type, Category, Airline, Departure City, Provider.
   - **Hotel Criteria**: Hotel City (Makkah/Madinah), Min Stars (1-5), Max Distance (Meters).
   - **Inventory**: Direct flight only, Seats available only.

3. **Human-Readable Labels in ActiveChips**:
   Update `ActiveChips` to format enum keys and IDs:
   - Occupancy: "Double", "Triple", "Quad"
   - Category: capitalize or format nicely
   - Product Type: format nicely
   - Provider: Lookup brand name from the active providers query
   - Months: Format "YYYY-MM" to readable Indonesian month names (e.g., "September 2026")

## Risks / Trade-offs

- [Mobile Layout Overflow] → Mitigated by applying scrollable containers (`overflow-y-auto max-h-[85vh]`) inside the bottom sheet.
- [API Validation Errors] → Mitigated by converting empty string values to `undefined` and parsing numeric strings before calling `useSearchPackages`.
