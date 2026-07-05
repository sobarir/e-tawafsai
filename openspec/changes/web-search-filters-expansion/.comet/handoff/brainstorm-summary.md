# Brainstorm Summary

- Change: web-search-filters-expansion
- Date: 2026-07-05

## Confirmed Technical Approach

1. **State & Performance Buffer**: Maintain a `localFilters` state inside `FilterSheet` to buffer inputs. Apply them to parent `filters` only when the user clicks the "Terapkan" (Apply) button.
2. **UI Layout**: Section-based vertical scrollable list layout on mobile-first sheet.
3. **Form Inputs**: Expose all missing filters from `searchPackagesSchema` including dropdowns for occupancy, product type, category, hotel city, min stars, month inputs (using `type="month"`), text inputs for airline/departureCity, and a provider dropdown.
4. **Dynamic Providers**: Query `useProviders(1, 100)` inside the search screen context to populate the provider selection list.
5. **Human-Readable Active Chips**: Update `ActiveChips` to map raw values (such as enum keys and provider IDs) into localized human-readable labels.

## Key Trade-offs and Risks

- [Mobile Space Constraints] → Mitigated by dividing the sheet into visual sections with headers, using a scrollable container (`overflow-y-auto max-h-[80vh]`).
- [Zod Validation Failures] → Mitigated by carefully casting empty numeric input strings to `undefined` and parsing number fields properly.

## Testing Strategy

- Manual verification of various search queries on the UI.
- Verify type checks and test suites run successfully with `bun run verify`.

## Spec Patches

- `openspec/specs/package-search/spec.md`: Update the UI de-scope notes to reflect the completed frontend filter implementation.
