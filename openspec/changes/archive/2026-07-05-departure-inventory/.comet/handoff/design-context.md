# Comet Design Handoff

- Change: departure-inventory
- Phase: design
- Mode: compact
- Context hash: 5c291a7c9d3400e37109bc1626f37556ecf76948ce6209f0aad454a4809223ac

Generated-by: comet-handoff.sh

OpenSpec remains the canonical capability spec. This handoff is a deterministic, source-traceable context pack, not an agent-authored summary.

## openspec/changes/departure-inventory/proposal.md

- Source: openspec/changes/departure-inventory/proposal.md
- Lines: 1-32
- SHA256: f3d9b5a32c412057e1b0f3bd0e0c4e404465e024b4b445ce742dbceed0e0ff9f

```md
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
```

## openspec/changes/departure-inventory/design.md

- Source: openspec/changes/departure-inventory/design.md
- Lines: 1-42
- SHA256: 534810b8667b7691bc8e5b92ac5afd34d15698c2541a1772a791ec7986306334

```md
# Design: departure-inventory

## Context

Child entity of packages carrying all money- and inventory-bearing data. Bookings (C9, Phase 2) will be the main consumer of seat mutations; in Phase 1 the mutation paths are manual adjustments and the C9-ready service API. This change introduces the app's first scheduled job (status auto-transitions).

## Goals / Non-Goals

**Goals:**
- ACID seat math with a concurrency-proof last-seat guarantee (PRD C4 acceptance).
- Price matrix per departure in integer minor units; currency seam per D6.
- Status lifecycle automation driven by both mutations (threshold/full) and time (departed).
- Auditability of every manual inventory adjustment.

**Non-Goals:**
- Booking entities/holds themselves (C9) — but the seat-mutation service API is designed for them now.
- `estimated_year` departures, USD display/kurs (C18). Public display (C6).

## Decisions

*(Direction; finalized in `/comet-design`.)*

1. **Seat mutations as single-statement conditional UPDATEs** (`SET seat_booked = seat_booked + $n WHERE id = $id AND seat_total - seat_booked - seat_held >= $n`) + a DB CHECK constraint (`seat_total - seat_booked - seat_held >= 0`) as backstop — row-lock-free correctness under concurrency; the affected-row count distinguishes success from "seat no longer available".
2. **`seatAvailable` computed** (generated column or query expression, not stored) so it can never drift from the invariant.
3. **Threshold/full transitions computed in the same transaction as the mutation**; `departed` transition via a scheduler (cron in the API process; also self-heals statuses on read to survive missed runs). `departed` never applies to `estimated_year` (seam note for C18).
4. **Prices in integer minor units** with `currency` column; formatting (`Rp 30.500.000`) is a shared util. Triple/double may be null when a flyer omits them; quad required for an `open` departure.
5. **Audit table** `inventory_adjustments` (departure, delta, reason note required, actor, timestamp) — manual adjustments only route through it.
6. **Auto-flag for review:** a package whose departures are all full/departed/cancelled gets a computed `needsReview` surfaced in admin list + dashboard; no stored flag to desync.

## Risks / Trade-offs

- [Scheduler drift/missed runs (single instance, Windows dev)] → self-healing status derivation on read paths; scheduler only persists the transition for widgets/queries.
- [CHECK constraint failure surfaces as raw DB error] → service maps to the envelope's ConflictException ("seat no longer available").
- [Threshold config lives in tenant-settings (parallel change)] → default constant (5) here; settings integration wired when tenant-settings lands (cross-change note in both).

## Migration Plan

Additive (`departures`, `inventory_adjustments`); seed demo departures for the demo package.

## Open Questions

- Whether `paymentSchedule` is free text or structured milestones in Phase 1 (PRD allows either; C9 will structure it — lean free-text now, confirm in design).
```

## openspec/changes/departure-inventory/tasks.md

- Source: openspec/changes/departure-inventory/tasks.md
- Lines: 1-26
- SHA256: b532b697a052f42a271b322056df65e6fcf15fe154a50f053e7ff94305dec459

```md
# Tasks: departure-inventory

## 1. Contracts & schema

- [ ] 1.1 Shared: `DEPARTURE_TYPES`, `DEPARTURE_STATUSES`, `CURRENCIES` tuples; departure schemas; IDR formatting util
- [ ] 1.2 DB: `departures` (CHECK constraint on seat invariant, computed seatAvailable), `inventory_adjustments`; migration + demo seed

## 2. API

- [ ] 2.1 Departures module per feature pattern; fixed_date-only validation; open-requires-priceQuad rule
- [ ] 2.2 Seat mutation service: conditional-UPDATE decrement/increment/hold APIs returning conflict on insufficient seats (C9-ready)
- [ ] 2.3 Status engine: transactional threshold/full transitions + reverse; scheduler job for `departed` with read-path self-healing
- [ ] 2.4 Manual adjustment endpoint with mandatory note → audit log
- [ ] 2.5 Package review-flag query (all departures closed) + dashboard widget endpoints (perlu didorong / urgensi closing)

## 3. Web UI

- [ ] 3.1 Departure table + create/edit form inside the package admin page (price matrix inputs, mobile-first)
- [ ] 3.2 Manual adjustment dialog with note; audit history view
- [ ] 3.3 Dashboard widgets + package needs-review badge

## 4. Verification

- [ ] 4.1 Unit tests: status engine matrix, invariant math, formatting util
- [ ] 4.2 Integration tests: concurrent last-seat race (exactly one winner), adjustment audit, departed transition
- [ ] 4.3 `bun run verify` and `bun run test:int` pass
```

## openspec/changes/departure-inventory/specs/departure-inventory/spec.md

- Source: openspec/changes/departure-inventory/specs/departure-inventory/spec.md
- Lines: 1-61
- SHA256: bd54ec74695676c8d20354beb634d222a7e994cf7a4963485aeacdf288f5f91e

```md
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
```

