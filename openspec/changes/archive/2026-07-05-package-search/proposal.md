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
