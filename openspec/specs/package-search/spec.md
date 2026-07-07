# package-search Specification

## Purpose
TBD - created by archiving change package-search. Update Purpose after archive.
## Requirements
### Requirement: Combined-filter search with departure semantics
The admin search SHALL combine filters — max price (quad by default, occupancy selectable), departure month/date range, duration range, category, airline, direct-only, hotel max distance (Makkah and/or Madinah), min stars, departure city, provider, seats-available-only — and SHALL return only packages having at least one departure satisfying all departure-level predicates (`open`/`almost_full`, date in range, price within budget, seats available when toggled). The category filter SHALL operate over admin-defined Package Categories by matching the category **name** (a package matches when its `categoryId` resolves to a category whose name equals the selected value), across providers, rather than the retired fixed category enum. The airline and departure-city filters SHALL operate over the Airline and Departure City master tables by matching the referenced row's **name** (a package matches when its `airlineId` / `departureCityId` resolves to a master row whose name equals the selected value), rather than the retired free-text columns; the referenced airline / departure-city name SHALL be resolved via join for the response. Direct-only filters on an explicit `packages.directOnly` boolean. The max-price predicate compares against the selected occupancy's price, falling back to `priceQuad` when that occupancy's price is null. All queries are tenant-scoped. The admin search screen surfaces all of these filter controls.

#### Scenario: PRD acceptance filter combination
- **WHEN** the agent searches with duration = 9 days, September departures, max price 30,000,000 quad
- **THEN** results contain only packages with `durationDays = 9` having ≥1 open September departure with `priceQuad ≤ 30,000,000`

#### Scenario: Seats-available-only toggle
- **WHEN** the toggle is on and a package's only matching departure has `seatAvailable = 0`
- **THEN** that package is excluded from results

#### Scenario: Direct-only filter
- **WHEN** the agent enables the direct-only filter
- **THEN** results contain only packages with `directOnly = true`

#### Scenario: Occupancy price fallback
- **WHEN** the max-price filter selects triple occupancy and a matching departure has `priceTriple = null`
- **THEN** the price predicate for that departure compares the max price against `priceQuad`

#### Scenario: Category filter over admin-defined categories
- **WHEN** the agent filters by a category name
- **THEN** results contain only packages whose `categoryId` resolves to a category with that name

#### Scenario: Airline filter over master data
- **WHEN** the agent filters by an airline name
- **THEN** results contain only packages whose `airlineId` resolves to an airline master row with that name, and each result card shows that airline name

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

