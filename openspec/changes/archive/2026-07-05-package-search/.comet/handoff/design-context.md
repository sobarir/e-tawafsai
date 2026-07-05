# Comet Design Handoff

- Change: package-search
- Phase: design
- Mode: compact
- Context hash: f20870983d3ccb710b743a1d47b3ebd402e5d9662b8ec81b92071885749f6096

Generated-by: comet-handoff.sh

OpenSpec remains the canonical capability spec. This handoff is a deterministic, source-traceable context pack, not an agent-authored summary.

## openspec/changes/package-search/proposal.md

- Source: openspec/changes/package-search/proposal.md
- Lines: 1-30
- SHA256: 9fb1c3acd490a30dedb4efca269f504712d19078e365a1cf360093ab3cb3a8ca

```md
# Proposal: package-search

## Why

The headline Phase 1 outcome: when a customer asks "9 hari, budget 30 juta, September, direct flight", the agent gets matching packages in seconds instead of scrolling flyer images for 5–10 minutes (PRD C5; success metric <30s to answer).

## What Changes

- A single admin search screen combining filters: max price (against quad by default, occupancy selectable), departure month/date range, duration range, category, airline, direct-only toggle, hotel max distance (Makkah/Madinah), min stars, departure city, provider, seats-available-only toggle.
- Full-text search across title/description/hotel names/airline.
- Compact result cards: title, provider, next departure date, price-from, seats left, hotel distances, airline — with one-tap **copy WhatsApp summary** (plain-text block: package name, date, price per occupancy, hotels+distance, airline, seats left, PPIU license line) and **copy public link** (URL scheme reserved now; page ships with C6).
- Performance target: < 500 ms P95 at 1,000 packages / 5,000 departures.

## Capabilities

### New Capabilities

- `package-search`: combined-filter and full-text internal search over packages+departures with WhatsApp-ready result actions and the stated performance budget.

### Modified Capabilities

(none)

## Impact

- `packages/shared`: search query schema (all filters), result card DTO.
- `packages/db`: indexes to support filter combinations + Postgres full-text (tsvector) column/index.
- `apps/api`: search endpoint joining packages+departures under tenant scope.
- `apps/web`: search screen (mobile-first filter sheet), result cards, clipboard actions.
- Depends on: `package-catalog`, `departure-inventory`. The WhatsApp summary format is reused later by C8 templates and C21 recommendations.
```

## openspec/changes/package-search/design.md

- Source: openspec/changes/package-search/design.md
- Lines: 1-41
- SHA256: cdf17fcffc564ddea95cc59b2fc4b502c619ec59f5e531aac8ce17ac2503b464

```md
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
```

## openspec/changes/package-search/tasks.md

- Source: openspec/changes/package-search/tasks.md
- Lines: 1-22
- SHA256: a2f80c26761f0ea6d65680afa5b34d93e2568bc099bfbfd16ef798fb33cb4834

```md
# Tasks: package-search

## 1. Contracts & schema

- [ ] 1.1 Shared: search query schema (all filters + full-text), result card DTO, WhatsApp summary formatter (pure function + unit tests), public URL helper
- [ ] 1.2 DB: tsvector generated column + GIN index; composite departure indexes; migration; 1k/5k benchmark seed fixture

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
```

## openspec/changes/package-search/specs/package-search/spec.md

- Source: openspec/changes/package-search/specs/package-search/spec.md
- Lines: 1-51
- SHA256: 5e0e7077ffb5f30544d84764a0573b668e959ee08df80d1ab97112f22364cc1d

```md
# Delta Spec: package-search

## ADDED Requirements

### Requirement: Combined-filter search with departure semantics
The admin search SHALL combine filters — max price (quad by default, occupancy selectable), departure month/date range, duration range, category, airline, direct-only, hotel max distance (Makkah and/or Madinah), min stars, departure city, provider, seats-available-only — and SHALL return only packages having at least one departure satisfying all departure-level predicates (`open`/`almost_full`, date in range, price within budget, seats available when toggled). Direct-only filters on an explicit `packages.directOnly` boolean. The max-price predicate compares against the selected occupancy's price, falling back to `priceQuad` when that occupancy's price is null. All queries are tenant-scoped.

#### Scenario: PRD acceptance filter combination
- **WHEN** the agent searches duration 9, max price 30,000,000, month September
- **THEN** results contain only packages with `durationDays = 9` having ≥1 open September departure with `priceQuad ≤ 30,000,000`

#### Scenario: Seats-available-only toggle
- **WHEN** the toggle is on and a package's only matching departure has `seatAvailable = 0`
- **THEN** that package is excluded

#### Scenario: Direct-only filter
- **WHEN** the direct-only toggle is on
- **THEN** results contain only packages with `directOnly = true`

#### Scenario: Occupancy price fallback
- **WHEN** the max-price filter selects triple occupancy and a matching departure has `priceTriple = null`
- **THEN** the price predicate for that departure compares the max price against `priceQuad`

### Requirement: Full-text search
The search SHALL support full-text queries across title, description, hotel names, and airline, combinable with all structured filters.

#### Scenario: Hotel name query
- **WHEN** the agent types a hotel name fragment present in one package's Makkah hotel
- **THEN** that package is returned and unrelated packages are not

### Requirement: Result cards with one-tap actions
Results SHALL render as compact cards showing title, provider, next matching departure date, price-from, seats left, hotel distances, and airline, each with one-tap **copy WhatsApp summary** and **copy public link** actions, usable at 380px width.

#### Scenario: Copy WhatsApp summary
- **WHEN** the agent taps copy-WhatsApp-summary on a result
- **THEN** the clipboard contains a plain-text block with package name, departure date, prices per occupancy, hotels with distances, airline, seats left, and the PPIU legality line "Diselenggarakan oleh {provider.brandName} — PPIU SK {provider.ppiuLicenseNo}"

#### Scenario: WhatsApp summary when provider has no PPIU license
- **WHEN** the result's provider has no `ppiuLicenseNo`
- **THEN** the legality line reads "Diselenggarakan oleh {provider.brandName}" with the "— PPIU SK …" clause omitted

#### Scenario: Copy public link
- **WHEN** the agent taps copy-public-link
- **THEN** the clipboard contains the package's canonical public URL `https://{host}/paket/{slug}`, where `host` is the tenant's custom domain when set, otherwise `{tenant.slug}.{PUBLIC_BASE_DOMAIN}`

### Requirement: Performance budget
Search responses SHALL complete in under 500 ms at P95 with 1,000 packages and 5,000 departures per tenant.

#### Scenario: Seeded volume benchmark
- **WHEN** the integration suite runs the standard filter set against a seeded 1,000/5,000 fixture
- **THEN** measured response times satisfy the budget
```

