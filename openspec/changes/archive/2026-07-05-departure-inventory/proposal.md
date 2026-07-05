# Proposal: departure-inventory

## Why

Seat availability is invisible today: groups hold ~45 seats, popular departures sell out fast, and the agent risks selling seats that don't exist (PRD problem 2, C4). Inventory truth per departure — with atomic seat math — is a launch-blocking goal (zero overselling).

## What Changes

- Departure CRUD under a Package: `departureType` enum seam (`fixed_date`|`estimated_year` — only `fixed_date` usable until C18, per D6), `departureDate`, `returnDate`, `seatTotal`, `seatBooked`, `seatHeld`, computed `seatAvailable`, `currency` seam (`IDR`|`USD`, default IDR), price matrix (`priceQuad`, `priceTriple`, `priceDouble`), `dpAmount`, `paymentSchedule`, `status` (`open`|`almost_full`|`full`|`departed`|`cancelled`), `notes`.
- Invariant enforced transactionally: `seatAvailable = seatTotal − seatBooked − seatHeld`, never negative; concurrent decrements resolve to exactly one winner at the last seat.
- Status auto-transitions: `open → almost_full` at configurable threshold (default 5, from tenant settings) `→ full` at 0 `→ departed` after departureDate; manual `cancelled`.
- Manual seat adjustment (PPIU allotment changes) requiring an audit note; audit log on all inventory adjustments.
- Package↔departure invariant from the PRD: a published Package whose departures are all full/departed auto-flags for review ("waiting list" state surfaced to admin).
- Dashboard widget: departures within 45 days with seats remaining ("perlu didorong") and almost-full departures ("urgensi untuk closing").

## Capabilities

### New Capabilities

- `departure-inventory`: departure schedule + price matrix per departure, transactional seat inventory with auditability, status lifecycle automation, and the inventory dashboard widgets.

### Modified Capabilities

(none)

## Impact

- `packages/shared`: `DEPARTURE_TYPES`, `DEPARTURE_STATUSES`, `CURRENCIES` tuples; departure schemas incl. price matrix.
- `packages/db`: `departures` table (tenant-owned, FK package), `inventory_adjustments` audit table; migration.
- `apps/api`: departures module; transactional seat operations; scheduler job for `departed`/threshold transitions (first scheduled job in the app).
- `apps/web`: departure management UI within the package page; dashboard widgets.
- Depends on: `package-catalog`. Consumed by: `package-search`, Phase 2 bookings (C9) which will drive `seatBooked`/`seatHeld`.
