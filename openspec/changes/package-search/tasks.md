# Tasks: package-search

## 1. Contracts & schema

- [x] 1.1 Shared: search query schema (all filters + full-text), result card DTO, WhatsApp summary formatter (pure function + unit tests), public URL helper
- [x] 1.2 DB: tsvector generated column + GIN index; composite departure indexes; migration; 1k/5k benchmark seed fixture

## 2. API

- [ ] 2.1 Search endpoint: single Drizzle query with departure-level EXISTS predicates + aggregation (next departure, price-from, seats left)
- [ ] 2.2 Full-text integration combinable with structured filters; direct-only handling per design decision

## 3. Web UI

- [ ] 3.1 Search screen: bottom-sheet filters with active-filter chips, result card list (mobile-first 380px)
- [ ] 3.2 Clipboard actions (WhatsApp summary, public link) with mobile fallback

## 4. Verification

- [ ] 4.1 Unit tests: summary formatter output, query schema validation
- [ ] 4.2 Integration tests: PRD filter acceptance case, seats-toggle, full-text; benchmark against seeded fixture with EXPLAIN sanity + P95 budget
- [ ] 4.3 `bun run verify` and `bun run test:int` pass
