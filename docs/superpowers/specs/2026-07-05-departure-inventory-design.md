---
archived-with: 2026-07-05-departure-inventory
status: final
status: final
---
# Design Doc: Departure & Inventory (C4)

## Context
Departures act as the core booking units for packages, representing physical flights, dates, prices, and available seats. This design provides atomic seat management, payment milestone schedules, automated lifecycle transitions, and dashboard metrics.

## Goals
- Support fixed-date departures under a package.
- Concurrency-proof atomic seat updates.
- Structured payment schedule milestones based on relative days.
- Status automation (`open`, `almost_full`, `full`, `departed`) with self-healing read paths.
- Audit trail for manual seat adjustments.
- Package-level review flag when all departures are closed.

## Non-Goals
- Phase 2 booking entities.
- Estimated-year type departures (seam for C18).

## Decisions
1. **DB Columns**: Define `departures` and `inventory_adjustments` tables with strict foreign keys, enums, and a check constraint.
2. **ACID Seat Math**: Conditional SQL updates ensuring `seatTotal - seatBooked - seatHeld >= delta` and row-level locking.
3. **Structured Payment Schedule**: Saved as JSON array of `PaymentMilestone` items specifying name, amount, and relative `daysBeforeDeparture`.
4. **Self-Healing & Scheduler**: Run background cron to tag past departures as `departed` daily. Load paths will self-heal past departures inline.
5. **Needs Review Flag**: Computed dynamically on packages when all departures are either `full`, `departed`, or `cancelled`.

## Data Schema

### Departures Table
- `id`: ULID
- `tenantId`: FK tenants
- `packageId`: FK packages
- `departureType`: Enum (`fixed_date`, `estimated_year`)
- `departureDate`: Timestamp
- `returnDate`: Timestamp
- `seatTotal`: Integer
- `seatBooked`: Integer
- `seatHeld`: Integer
- `currency`: Enum (`IDR`, `USD`)
- `priceQuad`: Integer
- `priceTriple`: Integer (nullable)
- `priceDouble`: Integer (nullable)
- `dpAmount`: Integer
- `paymentSchedule`: Text (JSON string)
- `status`: Enum (`open`, `almost_full`, `full`, `departed`, `cancelled`)
- `notes`: Text

### Inventory Adjustments Table
- `id`: ULID
- `tenantId`: FK tenants
- `departureId`: FK departures
- `delta`: Integer
- `reason`: Text
- `actorId`: Text
- `createdAt`: Timestamp
