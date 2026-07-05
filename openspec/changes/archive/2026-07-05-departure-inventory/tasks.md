# Tasks: departure-inventory

## 1. Contracts & schema

- [x] 1.1 Shared: `DEPARTURE_TYPES`, `DEPARTURE_STATUSES`, `CURRENCIES` tuples; departure schemas; IDR formatting util
- [x] 1.2 DB: `departures` (CHECK constraint on seat invariant, computed seatAvailable), `inventory_adjustments`; migration + demo seed

## 2. API

- [x] 2.1 Departures module per feature pattern; fixed_date-only validation; open-requires-priceQuad rule
- [x] 2.2 Seat mutation service: conditional-UPDATE decrement/increment/hold APIs returning conflict on insufficient seats (C9-ready)
- [x] 2.3 Status engine: transactional threshold/full transitions + reverse; scheduler job for `departed` with read-path self-healing
- [x] 2.4 Manual adjustment endpoint with mandatory note → audit log
- [x] 2.5 Package review-flag query (all departures closed) + dashboard widget endpoints (perlu didorong / urgensi closing)

## 3. Web UI

- [x] 3.1 Departure table + create/edit form inside the package admin page (price matrix inputs, mobile-first)
- [x] 3.2 Manual adjustment dialog with note; audit history view
- [x] 3.3 Dashboard widgets + package needs-review badge

## 4. Verification

- [x] 4.1 Unit tests: status engine matrix, invariant math, formatting util
- [x] 4.2 Integration tests: concurrent last-seat race (exactly one winner), adjustment audit, departed transition
- [x] 4.3 `bun run verify` and `bun run test:int` pass
