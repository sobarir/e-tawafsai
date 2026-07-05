---
comet_change: package-search
role: technical-design
canonical_spec: openspec
---

# Technical Design: Package Search (C5)

Internal admin search over the existing catalog + inventory schema. A package
matches when **at least one departure** satisfies the departure-level predicates
(departure-centric semantics per PRD C5). At the target scale (1,000 packages /
5,000 departures per tenant) this is an indexing-and-query-shape problem, solved
with Postgres-native full-text — no external search service.

The canonical requirements live in the OpenSpec delta spec
(`openspec/changes/package-search/specs/package-search/spec.md`). This document
records the technical decisions and structure only.

## 1. Database Schema (`packages/db`)

Two additive schema changes plus indexes. No data changes; migration backfills
defaults.

### 1.1 `packages.directOnly` column

`direct-only` has no existing column — `packages` carries only free-text
`flightRoute` and `airline`. We add an explicit boolean rather than parse free
text (reliable, exact filtering).

```ts
// packages/db/src/schema/packages.ts (added field)
directOnly: boolean("direct_only").notNull().default(false),
```

Backfills to `false`; existing create/update paths keep working. This deliberately
extends `package-search` into the package-catalog schema (additive only).

### 1.2 Full-text `search_doc` generated column + GIN index

A Postgres generated column can only reference its own row, so `search_doc` covers
**package-local** text (`title`, `description`, `airline`). Hotel names live in
`package_hotels` and are matched separately (§3.2).

```sql
-- migration (hand-authored SQL alongside the generated migration)
CREATE EXTENSION IF NOT EXISTS unaccent;

ALTER TABLE packages ADD COLUMN search_doc tsvector
  GENERATED ALWAYS AS (
    to_tsvector('simple',
      unaccent(coalesce(title,'') || ' ' ||
               coalesce(description,'') || ' ' ||
               coalesce(airline,'')))
  ) STORED;

CREATE INDEX packages_search_doc_gin ON packages USING gin (search_doc);
```

Config is `simple` + `unaccent` (Postgres has no Indonesian stemmer). If recall
disappoints during verify, revisit with `pg_trgm` (see §6).

> `unaccent` is not `IMMUTABLE` by default in some setups; if the generated-column
> expression is rejected, wrap via a project-owned `IMMUTABLE` wrapper function or
> fall back to a plain (non-generated) column maintained in the migration's
> `to_tsvector` — decided at build time against the actual PG image.

### 1.3 Indexes for the departure predicate

```sql
CREATE INDEX departures_search_idx
  ON departures (tenant_id, status, departure_date, price_quad);
-- package_hotels already indexable by package_id (FK); add if EXPLAIN shows a gap
```

## 2. Contracts (`packages/shared`)

All wire shapes live here (DRY rule 1). Nothing search-shaped is defined inside an app.

### 2.1 Query schema — `searchPackagesSchema` (Zod)

Fields (all optional except pagination defaults):

- `q?: string` — full-text query.
- `maxPrice?: number`, `occupancy?: "quad" | "triple" | "double"` (default `quad`).
- `monthFrom?`, `monthTo?` (or explicit `dateFrom`/`dateTo` ISO) — departure date range.
- `durationMin?`, `durationMax?: number`.
- `category?: PackageCategory`, `productType?: ProductType`.
- `airline?: string`, `departureCity?: string`, `providerId?: string(26)`.
- `directOnly?: boolean`.
- `hotelCity?: "Makkah" | "Madinah"`, `maxDistanceM?: number`, `minStars?: number`.
- `seatsAvailableOnly?: boolean`.
- pagination (`page`, `pageSize`) reusing `packages/shared/src/pagination.ts`.

`hotelCity` is matched by string equality against `package_hotels.cityName`
(consistent with package-catalog, which treats `cityName === 'Makkah'` as canonical).

### 2.2 Result DTO — `SearchResultDto`

Compact card shape (not the full `PackageDto`):

```ts
export interface SearchResultDto {
  id: string;
  title: string;
  slug: string;
  providerName: string;
  providerBrandName: string;        // for the WhatsApp summary
  ppiuLicenseNo: string | null;     // for the WhatsApp summary
  category: string;
  airline: string | null;
  nextDepartureDate: string;        // ISO — earliest matching departure
  priceFrom: number;                // min priceQuad among matching departures
  priceByOccupancy: { quad: number; triple: number | null; double: number | null };
  seatsLeft: number;                // seats of the next matching departure
  hotels: { cityName: string; name: string; stars: number; distanceM: number | null }[];
}
```

### 2.3 WhatsApp summary — `formatWhatsappSummary(dto, ctx)`

Pure, deterministic function → plain-text block. Becomes the de-facto template
reused byte-for-byte by C8 (quote template) and C21 (recommendations), so it is
unit-tested against fixed expected output.

Block contents: package name, next departure date, prices per occupancy, hotels
with city + distance, airline, seats left, and the legality line:

```
Diselenggarakan oleh {provider.brandName} — PPIU SK {provider.ppiuLicenseNo}
```

**Null-license branch:** when `ppiuLicenseNo` is null, omit the "— PPIU SK …"
clause but keep "Diselenggarakan oleh {provider.brandName}". Both branches are
tested.

### 2.4 Public URL — `packagePublicUrl(tenant, slug)`

```
host = tenant.customDomain ?? `${tenant.slug}.${PUBLIC_BASE_DOMAIN}`
url  = `https://${host}/paket/${slug}`
```

`PUBLIC_BASE_DOMAIN` is a config value. The helper always emits a link; C6
implements the actual `/paket/{slug}` route (cross-change contract, noted in both).

## 3. API (`apps/api/src/search`) — new module

### 3.1 Endpoint

- `GET /search/packages` — `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles("admin","user")`,
  `ZodValidationPipe(searchPackagesSchema)` on the query. Tenant-scoped via
  `TenantScopedDb`. Returns `Paginated<SearchResultDto>`.

### 3.2 Single query shape

One Drizzle query, no ORM-side filtering:

- **Base:** `packages` where `tenantId = :tenant` and `status <> 'archived'`, plus
  structured predicates (category, productType, airline, directOnly, departureCity,
  providerId, duration range).
- **Departure predicate:** correlated `EXISTS` over `departures`:
  - `status IN ('open','almost_full')`
  - `departure_date` within the requested range
  - `seat_total - seat_booked - seat_held > 0` when `seatsAvailableOnly`
  - price ≤ `maxPrice` against the selected occupancy column, **falling back to
    `priceQuad` when the selected occupancy price is null** (decision C).
- **Hotel predicate:** correlated `EXISTS` over `package_hotels` for
  `cityName = hotelCity`, `distanceM <= maxDistanceM`, `stars >= minStars`, and/or
  hotel-name match when `q` is present (ILIKE on `name`, or `to_tsvector` if EXPLAIN
  warrants).
- **Full-text:** `search_doc @@ plainto_tsquery('simple', unaccent(:q))` OR the
  hotel-name predicate above (a `q` hit on either the package doc or a hotel name
  qualifies).
- **Aggregation per package:** `nextDepartureDate` = min matching `departure_date`;
  `priceFrom` = min matching `priceQuad`; `seatsLeft` = seats of that next departure.
  Provider fields joined in.

Provider brand/license and hotel rows are fetched in the same round-trip (join +
correlated aggregation) to keep the endpoint within the P95 budget.

## 4. Web UI (`apps/web`)

- **Search screen** (`src/app/dashboard/search`): mobile-first (380px). Bottom-sheet
  filter panel; active filters shown as removable chips. Results as a compact card
  list.
- **Result card:** title, provider, next departure date, price-from, seats-left,
  hotel distances, airline, with two one-tap actions.
- **Clipboard actions:** reuse `formatWhatsappSummary` and `packagePublicUrl`
  client-side. Copy via `navigator.clipboard` with an `execCommand('copy')` fallback
  for older mobile browsers; success/failure surfaced with `role="alert"`.
- **Data fetching:** TanStack Query hook `useSearchPackages(params)`, query key
  `["search", params]`, all HTTP via the shared `api` ky instance.
- **Phase-1 filter subset (de-scoped after review):** the screen surfaces
  full-text query, max price, minimum duration, direct-only, and
  seats-available-only. The API accepts the full filter set; the remaining UI
  controls (occupancy selector, month/date range, exact duration range, category,
  airline, hotel city + min stars + max distance, departure city, provider) are a
  documented follow-up. Note this leaves decision C (occupancy fallback)
  API-only until the occupancy selector ships.

## 5. Search scope decision

Search returns `draft` + `published` packages and excludes `archived`. Rationale:
it is an internal admin tool, and sellability is already gated by the departure
status predicate (`open`/`almost_full`) — a package surfaced by search necessarily
has a live departure.

## 6. Risks / Trade-offs

- **Indonesian full-text quality** (`simple` + `unaccent`, no stemmer): acceptable
  for title/hotel/airline token matching; `pg_trgm` fallback if verify recall is poor.
- **`unaccent` immutability** for the generated column: mitigation in §1.2.
- **Filter-combinatorics tail plan:** verified with a seeded `EXPLAIN ANALYZE` on the
  1k/5k fixture + soft P95 assertion; add covering indexes only where measured.
- **Clipboard API on mobile:** `execCommand` fallback + manual Android Chrome check
  during verify.
- **`directOnly` touches package-catalog schema:** additive only, backfills false.

## 7. Testing Strategy

- **Unit (`packages/shared`):** `formatWhatsappSummary` output including the
  null-license branch; `packagePublicUrl` (customDomain vs slug subdomain);
  `searchPackagesSchema` validation.
- **Integration (`apps/api`, real Postgres):** PRD acceptance combo
  (duration 9 / maxPrice 30,000,000 / September); seats-available-only exclusion;
  hotel-name full-text match; occupancy price → `priceQuad` fallback; seeded 1k/5k
  benchmark with `EXPLAIN` sanity + P95 < 500 ms soft budget.
- Gate: `bun run verify` and `bun run test:int` pass.

## 8. Migration Plan

Additive migration: `directOnly` column (default false), `unaccent` extension,
`search_doc` generated tsvector + GIN index, `departures_search_idx`. No data
backfill beyond column defaults.
