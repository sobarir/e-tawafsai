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
