# Delta Spec: departure-inventory

## ADDED Requirements

### Requirement: Departure entity with price matrix
The system SHALL provide CRUD for Departures under a Package with: `departureType` (`fixed_date`|`estimated_year`; only `fixed_date` accepted until C18), `departureDate`, `returnDate`, `seatTotal`, `seatBooked`, `seatHeld`, computed `seatAvailable`, `currency` (`IDR`|`USD`, default `IDR`), `priceQuad`, `priceTriple` (nullable), `priceDouble` (nullable), `dpAmount`, `paymentSchedule`, `status`, `notes`. Prices SHALL be stored as integers in minor units. A departure SHALL NOT be `open` without `priceQuad`.

#### Scenario: Create departure with price matrix
- **WHEN** an admin adds a departure with date, seatTotal 45, and quad/triple/double prices
- **THEN** it is saved with `seatAvailable = 45` and status `open`

#### Scenario: estimated_year rejected in Phase 1
- **WHEN** a departure specifies `departureType = estimated_year`
- **THEN** the request is rejected (seam unlocks with C18)

### Requirement: Atomic seat inventory invariant
`seatAvailable = seatTotal − seatBooked − seatHeld` SHALL never be negative; all seat mutations SHALL be transactional and concurrency-safe such that oversell is impossible.

#### Scenario: Concurrent last-seat decrement
- **WHEN** two seat decrements of 1 execute concurrently against a departure with `seatAvailable = 1`
- **THEN** exactly one succeeds and the other receives a "seat no longer available" conflict error

#### Scenario: Oversized decrement rejected
- **WHEN** a decrement of 4 targets a departure with `seatAvailable = 3`
- **THEN** the mutation fails atomically and counts are unchanged

### Requirement: Status lifecycle automation
Departure status SHALL transition automatically: `open → almost_full` when `seatAvailable ≤` the tenant's threshold (default 5), `→ full` at 0, `→ departed` after `departureDate` (fixed_date only); `cancelled` is manual. Reverse transitions occur when seats are released above the threshold.

#### Scenario: Threshold transition
- **WHEN** a mutation drops `seatAvailable` from 6 to 5 with threshold 5
- **THEN** status becomes `almost_full` in the same transaction

#### Scenario: Departed by time
- **WHEN** `departureDate` passes
- **THEN** status becomes `departed` and the departure is excluded from open-departure queries

### Requirement: Manual adjustment with audit
Manual seat adjustments (allotment changes) SHALL require an audit note and record actor, delta, note, and timestamp in an inventory audit log; adjustments violating the invariant are rejected.

#### Scenario: Adjustment without note rejected
- **WHEN** an admin submits a seat adjustment with an empty note
- **THEN** the request is rejected with a field-level error

#### Scenario: Adjustment audited
- **WHEN** an admin raises `seatTotal` by 5 with a note
- **THEN** an audit entry exists with actor, +5, and the note

### Requirement: Package review flag
A published Package whose Departures are all `full`, `departed`, or `cancelled` SHALL be flagged for review in the admin UI (waiting-list state per PRD invariant).

#### Scenario: All departures full
- **WHEN** the last open departure of a published package becomes full
- **THEN** the package appears as needing review in the admin list and dashboard

### Requirement: Inventory dashboard widgets
The dashboard SHALL show departures within 45 days that still have seats ("perlu didorong") and departures in `almost_full` ("urgensi untuk closing"), each with seats remaining and days to departure.

#### Scenario: Push-needed widget
- **WHEN** a departure is 30 days out with 12 seats available
- **THEN** it appears in the "perlu didorong" widget
