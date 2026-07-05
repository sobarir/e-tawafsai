# Brainstorm Summary

- Change: package-search
- Date: 2026-07-05

## Confirmed Technical Approach

Read-mostly internal admin search over the existing catalog + inventory schema,
with departure-centric matching semantics (a package matches when ≥1 departure
satisfies the departure-level predicates). Postgres-native full-text; no external
search service at 1k/5k scale.

**Query shape (single Drizzle query, tenant-scoped):**
- Base: `packages` joined to a correlated `EXISTS` over `departures` carrying the
  date-range, price, seats, and status (`open`/`almost_full`) predicates.
- Structured filters on `packages`: category, airline, direct-only, departure city,
  provider, duration range, product type.
- Hotel filters (max distance Makkah/Madinah, min stars) and hotel-name full-text
  via correlated `EXISTS` over `packageHotels`.
- Aggregation returns per package: next matching departure date, price-from, seats-left.
- Package status: exclude `archived`; include `draft` + `published` (internal tool,
  sellability already gated by the departure status predicate).

## Confirmed Decisions

- **A. Direct-only → explicit column.** Add `packages.directOnly` boolean
  (default false) + create/update schema field + additive migration. Spec patch
  adds the acceptance scenario. (Expands change into package-catalog schema.)
- **B. Hotel-name full-text → packages tsvector + hotel EXISTS.** GIN generated
  `tsvector` column on `packages` (title, description, airline; `simple` config +
  `unaccent`). Hotel-name query matched via `EXISTS` predicate on `packageHotels`
  (ILIKE / tsvector). No triggers, additive.
- **C. Occupancy price null → fall back to priceQuad.** When the selected occupancy
  (triple/double) price is null on a departure, the price predicate compares against
  `priceQuad`.
- **D. PPIU legality line → provider brand + provider license.** Use
  `provider.brandName` + `provider.ppiuLicenseNo`. If `ppiuLicenseNo` is null, omit
  the "PPIU SK …" clause but keep "Diselenggarakan oleh {provider.brandName}".
- **E. Public URL host → customDomain else slug subdomain.** `tenant.customDomain`
  when set, else `{tenant.slug}.{PUBLIC_BASE_DOMAIN}` (config value). Helper in
  `packages/shared`; always emits a link. C6 implements the actual `/paket/{slug}` route.

## Key Trade-offs and Risks

- Indonesian full-text quality with `simple` + `unaccent`: acceptable for
  title/hotel/airline token matching; revisit with `pg_trgm` if recall disappoints
  during verify.
- Filter combinatorics tail plan: verify with seeded `EXPLAIN ANALYZE` (1k/5k
  fixture) + soft P95 assertion; add covering indexes only where measured.
- Clipboard API on mobile: `navigator.clipboard` with `execCommand` fallback; manual
  Android Chrome check during verify.
- Adding `directOnly` touches package-catalog schema — additive only, backfills to
  false; existing create/update paths keep working.

## Testing Strategy

- Unit (`packages/shared`): WhatsApp summary formatter output (incl. null-license
  branch), public URL helper (customDomain vs subdomain), search query schema validation.
- Integration (`apps/api`, real Postgres): PRD acceptance combo (dur 9 / ≤30jt / Sep),
  seats-available toggle exclusion, hotel-name full-text match, occupancy price
  fallback; seeded 1k/5k benchmark with `EXPLAIN` sanity + P95 < 500 ms soft budget.

## Spec Patches (write back to delta spec)

- Add `directOnly` to the combined-filter requirement + a "Direct-only filter"
  acceptance scenario.
- Clarify occupancy-price fallback semantics in the combined-filter scenario.
- Clarify PPIU line uses provider brand/license (and null-license omission) in the
  copy-WhatsApp-summary scenario.
