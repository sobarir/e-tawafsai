# Design: package-search

## Context

Read-only feature over the catalog+inventory schema; the semantics are departure-centric (a package matches when ≥1 departure satisfies the date/price/seats filters — PRD C5 acceptance). Scale target is modest (1k packages / 5k departures), so this is an indexing-and-query-shape problem, not a search-infrastructure problem.

## Goals / Non-Goals

**Goals:**
- One query path answering all filter combinations correctly with departure-level semantics.
- Postgres-native full-text (no external search service at this scale).
- WhatsApp summary as a deterministic, tested text formatter (it becomes a de-facto template for C8/C21).
- P95 < 500 ms verified with seeded volume.

**Non-Goals:**
- Public-site filtering (C6 — different, smaller filter set). Saved searches. Fuzzy/typo tolerance beyond Postgres defaults. Product-type facet (C18 adds it).

## Decisions

*(Direction; finalized in `/comet-design`.)*

1. **Single SQL query** joining packages→departures with `EXISTS`-style departure predicates (month range, priceQuad ≤ X or selected occupancy, seats > 0, status open/almost_full), returning aggregated next-departure/price-from/seats-left per package. Drizzle query builder; no ORM-side filtering.
2. **Full-text via generated `tsvector` column** (title, description, hotel names, airline; `indonesian`-adjacent config decided by testing — Postgres lacks a dedicated Indonesian stemmer, so `simple` config + `unaccent` is the likely choice).
3. **Indexes:** composite on departures (tenant, status, departure_date, price_quad), GIN on the tsvector; verify with `EXPLAIN ANALYZE` against a 1k/5k seed fixture in an integration test with a soft time assertion.
4. **WhatsApp summary formatting in `packages/shared`** (pure function over the result DTO) so web copies client-side and later features (C8 quote template, C21) reuse it byte-for-byte; includes the legality line "Diselenggarakan oleh {brandName} — PPIU SK {ppiuLicenseNo}".
5. **Public link scheme reserved:** `https://{tenant-domain}/paket/{slug}` emitted by a shared URL helper; C6 must implement that route (cross-change contract noted in both).
6. **Mobile filter UX:** bottom-sheet filter panel with chips for active filters; results virtualized list.

## Risks / Trade-offs

- [Indonesian full-text quality with `simple` config] → acceptable for title/hotel/airline token matching; revisit with trigram (pg_trgm) if recall disappoints during verify.
- [Filter combinatorics produce a bad plan at the tail] → seeded EXPLAIN test; add covering indexes only where measurements demand.
- [Clipboard API quirks on mobile browsers] → use navigator.clipboard with execCommand fallback; manual check on Android Chrome during verify.

## Migration Plan

Additive migration: tsvector column + indexes. No data changes.

## Open Questions

- Whether "direct-only" is derivable from `flightRoute` structure or needs an explicit boolean on packages (leaning explicit boolean set during entry; confirm in design).
