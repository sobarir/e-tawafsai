## MODIFIED Requirements

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
