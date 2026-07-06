## Why

Admins cannot enter full departure pricing where they expect it. The *Create Package* form has no price or departure-date entry at all — departures (which own the date and price) only appear after the package is saved. Even then, the departure form exposes only the Quad price and DP, so the triple/double prices already in the schema are unreachable, and there is no way to record a promotional ("discounted") price alongside the normal one.

## What Changes

- Add an optional, nullable **discounted price per occupancy** to departures: `priceQuadDiscount`, `priceTripleDiscount`, `priceDoubleDiscount`. When present, each SHALL be a positive integer no greater than its normal counterpart.
- Expose **triple and double normal prices** in the departure entry form (columns already exist; only the UI is missing).
- Expose the three **discounted prices** in the departure entry form and show them in the departure card.
- Add an **optional inline "first departure"** block to the *Create Package* form so an admin can enter departure date + return date + the full quad/triple/double normal & discounted prices + seats/DP while creating a new package. If left blank, the package is created with no departures exactly as today.
- Keep the price matrix's existing rule that a departure SHALL NOT be `open` without `priceQuad`; discounted fields never gate publish or availability.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `departure-inventory`: the "Departure entity with price matrix" requirement gains the three nullable discounted-price fields and their `discount ≤ normal` validation; a new requirement covers creating an initial departure inline with a new package.

## Impact

- **Schema** (`packages/db/src/schema/departures.ts`): three new nullable integer columns + generated migration.
- **Shared contract** (`packages/shared/src/departures.ts`): request schema (Zod) and response type gain the discounted fields with cross-field validation.
- **API** (`apps/api/src/departures/*`): mapper + create/update paths carry the new fields; no seat-inventory, payment-schedule, or adjustment logic changes.
- **Web** (`apps/web/src/app/dashboard/packages/[id]/page.tsx`): triple/double/discount inputs in `DeparturesSection`; a new optional inline departure block on the create flow that posts a departure after the package is created.
- **Out of scope**: moving pricing onto the package; changing public search/`priceFrom` to use discounted prices; any change to seat inventory or payment milestones.
