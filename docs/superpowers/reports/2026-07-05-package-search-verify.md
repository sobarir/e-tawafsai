# Verification Report: package-search (C5)

- Date: 2026-07-05
- Mode: full
- Change: package-search
- Base ref: e6f766749b59dab64463a62525e30e1c2a230af7
- Branch: feature/20260705/package-search

## Summary

| Dimension    | Status |
|--------------|--------|
| Completeness | 9/9 tasks.md complete · 4/4 delta requirements implemented |
| Correctness  | 9/9 delta scenarios covered by tests · verify 12/12 · int 26/26 |
| Coherence    | Matches design.md + Design Doc; drift resolved & documented |

## Fresh verification evidence

- `bun run verify` → **12/12 tasks successful, exit 0** (typecheck + lint + unit tests across shared/db/api/web).
- `bun run test:int` (apps/api) → **7 files, 26 tests passed, exit 0** (includes all 7 search specs + benchmark).
- `openspec validate package-search --strict` → **valid**.
- Benchmark: rows query 275ms→8ms after indexing; rows+count P95 ~17ms (budget 500ms). EXPLAIN asserts no departures seq-scan.

## Completeness

- tasks.md: `grep -c '- [ ]'` = 0 (all 9 checked); plan steps all checked.
- Delta requirements (4) all implemented:
  1. Combined-filter search with departure semantics — `apps/api/src/search/search.service.ts`.
  2. Full-text search — `search_doc` tsvector + GIN (migration 0011) + hotel EXISTS.
  3. Result cards with one-tap actions — `apps/web/src/app/dashboard/search/` + shared formatter/URL helper.
  4. Performance budget — indexes (0011/0012) + benchmark.

## Correctness — scenario → test coverage

| Delta scenario | Covered by |
|----------------|-----------|
| PRD acceptance filter combination | `search.service.int.spec.ts` — "PRD combo" |
| Seats-available-only toggle | `search.service.int.spec.ts` — "excludes … zero seats" |
| Direct-only filter | `search.service.int.spec.ts` — "returns only direct-only" |
| Occupancy price fallback | `search.service.int.spec.ts` — "falls back to priceQuad" + over-budget exclusion |
| Hotel name query | `search.service.int.spec.ts` — "matches a hotel-name fragment" |
| Copy WhatsApp summary | `search.spec.ts` — formatter content test; web `page.tsx` `onCopySummary` |
| WhatsApp summary, no PPIU license | `search.spec.ts` — "omits the PPIU SK clause" |
| Copy public link | `search.spec.ts` — `packagePublicUrl` (both host branches); web `onCopyLink` |
| Seeded volume benchmark | `search.benchmark.int.spec.ts` — P95 + EXPLAIN |

Additional coverage beyond the delta scenarios: priceFrom = min-across-matching, pagination stability, hotel city+minStars+maxDistance filter.

## Coherence

- design.md decisions all followed: single SQL query with departure EXISTS/aggregation; Postgres-native full-text; measured indexing verified with EXPLAIN; WhatsApp formatting in `packages/shared`; reserved public URL scheme; mobile filter UX. The design.md open question (direct-only) resolved to an explicit `packages.directOnly` boolean.
- Design Doc (`docs/superpowers/specs/2026-07-05-package-search-design.md`) matches implementation; documented deviations (unaccent-immutability fallback, server-computed publicUrl) recorded. Roles reference corrected to `admin`/`staff`.
- Delta-spec ↔ design-doc drift: none unresolved. The Phase-1 UI filter subset is recorded in both the delta spec and the design doc.

## Accepted deviations (non-blocking)

- **UI filter subset (user-approved de-scope):** the web sheet exposes full-text, max price, min duration, direct-only, seats-available-only. The API supports the full filter set (all integration-tested). Impact: decision C (occupancy fallback) is API-only until the occupancy selector ships. Recorded in delta spec + design doc + tasks.md.
- **Unmanaged raw DB objects:** `search_doc`, its GIN index, and `departures_search_idx` live in hand-written migration 0011 (not the Drizzle model); reproducible on replay. `departures_search_idx` likely superseded by `departures_pkg_idx` — flagged for future cleanup.
- **Minor:** no query-input debounce; benchmark fixture re-exported from db barrel; `departures.departureDate` is a tz-naive `timestamp` column (pre-existing). All low-risk.

## Assessment

**No CRITICAL or IMPORTANT issues. Ready for archive.** All delta-spec scenarios are implemented and covered by passing tests; both quality gates are green on fresh runs; code review findings were fixed or explicitly accepted with rationale.
