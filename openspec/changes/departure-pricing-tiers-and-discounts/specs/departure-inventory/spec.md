## MODIFIED Requirements

### Requirement: Departure entity with price matrix
The system SHALL provide CRUD for Departures under a Package with: `departureType` (`fixed_date`|`estimated_year`; only `fixed_date` accepted until C18), `departureDate`, `returnDate`, `seatTotal`, `seatBooked`, `seatHeld`, computed `seatAvailable`, `currency` (`IDR`|`USD`, default `IDR`), `priceQuad`, `priceTriple` (nullable), `priceDouble` (nullable), `priceQuadDiscount` (nullable), `priceTripleDiscount` (nullable), `priceDoubleDiscount` (nullable), `dpAmount`, `paymentSchedule`, `status`, `notes`. Prices SHALL be stored as integers in minor units. Each discounted price, when provided, SHALL be a positive integer no greater than its normal counterpart, and SHALL be rejected with a field-level error otherwise. A departure SHALL NOT be `open` without `priceQuad`; discounted prices SHALL never gate `open` status or availability.

#### Scenario: Create departure with full price matrix
- **WHEN** an admin adds a departure with date, seatTotal 45, quad/triple/double normal prices, and quad/triple/double discounted prices each below their normal price
- **THEN** it is saved with `seatAvailable = 45`, status `open`, and all six price fields persisted

#### Scenario: Discounted price above normal rejected
- **WHEN** an admin submits a departure whose `priceTripleDiscount` exceeds `priceTriple`
- **THEN** the request is rejected with a field-level error and nothing is persisted

#### Scenario: Discounted prices optional
- **WHEN** an admin adds a departure with only normal prices and no discounted prices
- **THEN** it is saved with the discounted fields null and status `open`

#### Scenario: estimated_year rejected in Phase 1
- **WHEN** a departure specifies `departureType = estimated_year`
- **THEN** the request is rejected (seam unlocks with C18)

## ADDED Requirements

### Requirement: Inline first departure on package creation
The Create Package form SHALL offer an optional departure entry (date, return date, seats, DP, and the full quad/triple/double normal & discounted price matrix). When the admin completes it, the system SHALL create that departure immediately after the package is created. When the departure entry is left empty, the package SHALL be created with no departures, preserving draft-first creation. Departure entry made inline SHALL be validated by the same rules as the standalone departure form.

#### Scenario: Package created with an inline departure
- **WHEN** an admin creates a new package and fills the inline departure with a date and at least a quad price
- **THEN** the package is created and exactly one departure exists for it with the entered prices

#### Scenario: Package created without a departure
- **WHEN** an admin creates a new package and leaves the inline departure entry empty
- **THEN** the package is created with zero departures and no validation error is raised

#### Scenario: Invalid inline departure blocks creation feedback
- **WHEN** an admin fills the inline departure with a discounted price above its normal price
- **THEN** a field-level error is surfaced and the departure is not created
