# Tasks: package-search

## 1. Contracts & schema

- [x] 1.1 Shared: search query schema (all filters + full-text), result card DTO, WhatsApp summary formatter (pure function + unit tests), public URL helper
- [x] 1.2 DB: tsvector generated column + GIN index; composite departure indexes; migration; 1k/5k benchmark seed fixture

## 2. API

- [x] 2.1 Search endpoint: single Drizzle query with departure-level EXISTS predicates + aggregation (next departure, price-from, seats left)
- [x] 2.2 Full-text integration combinable with structured filters; direct-only handling per design decision

## 3. Web UI

- [x] 3.1 Search screen: bottom-sheet filters with active-filter chips, result card list (mobile-first 380px)
- [x] 3.2 Clipboard actions (WhatsApp summary, public link) with mobile fallback

## 4. Verification

- [x] 4.1 Unit tests: summary formatter output, query schema validation
- [x] 4.2 Integration tests: PRD filter acceptance case, seats-toggle, full-text; benchmark against seeded fixture with EXPLAIN sanity + P95 budget
- [x] 4.3 `bun run verify` and `bun run test:int` pass

## Code review outcome

Reviewed range `e6f7667..HEAD` (senior-reviewer subagent). No Critical issues.

**Fixed:**
- Important: stable pagination tiebreaker (`ORDER BY nd.departure_date, p.id`).
- Important: `priceFrom` now = MIN(price_quad) across matching departures (was the
  earliest departure's price), via a window; added int specs for both fixes plus
  occupancy-over-budget and hotel city/stars/distance coverage.
- Minor: filter sheet a11y (Escape-to-close, `aria-labelledby`).

**Accepted / de-scoped (rationale):**
- UI exposes a Phase-1 filter subset; remaining controls (occupancy, month range,
  category, airline, hotel facets, departure city, provider, durationMax) are a
  documented follow-up. API supports the full set. Recorded in delta spec + design
  doc. Impact: decision C (occupancy fallback) is API-only until the occupancy
  selector ships.
- Minor `search_doc`/GIN/`departures_search_idx` live only in hand-written
  migration 0011 (not the Drizzle model); reproducible on replay. `departures_search_idx`
  is likely superseded by `departures_pkg_idx` — left in place, flagged for a
  future cleanup rather than churning another migration.
- Minor: no debounce on the query input; benchmark fixture re-exported from the db
  barrel; some coverage gaps (cross-tenant isolation, custom-domain publicUrl) —
  low risk, deferred.
- Observation: `departures.departureDate` is a tz-naive `timestamp` column, so
  exact-instant round-trips shift by the session offset. Pre-existing; not in scope.
