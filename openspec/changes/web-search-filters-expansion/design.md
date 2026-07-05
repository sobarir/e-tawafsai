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
