# admin-dashboard Specification

## Purpose
TBD - created by archiving change public-landing-and-kpi-dashboard. Update Purpose after archive.
## Requirements
### Requirement: Admin dashboard summary endpoint

The system SHALL expose an admin-guarded endpoint that returns a summary of the current
tenant's operational state, aggregated from existing entities. It MUST require a valid
session and the `admin` or `staff` role, and MUST be scoped to the caller's tenant. The
summary SHALL include: package counts (total, published, draft), departure signals
(upcoming departures and almost-full count), open seats across upcoming departures, and
provider counts (total, active).

#### Scenario: Authenticated admin requests the summary
- **WHEN** an authenticated admin or staff user requests the dashboard summary
- **THEN** the system responds `200` with tenant-scoped counts for packages, departures, and providers

#### Scenario: Unauthenticated request is rejected
- **WHEN** an unauthenticated request hits the dashboard summary endpoint
- **THEN** the system responds `401` (the endpoint is not public)

#### Scenario: Counts are tenant-scoped
- **WHEN** two tenants each have their own packages, departures, and providers
- **THEN** each tenant's summary reflects only its own rows

### Requirement: Operational signal lists in the summary

The summary SHALL include two bounded operational lists computed from the tenant's
departures: (1) **urgent closing** — departures whose status is `almost_full`; and
(2) **needs push** — departures whose `departureDate` is within the next 45 days with
status `open` or `almost_full` and at least one seat remaining
(`seatTotal - seatBooked - seatHeld > 0`). Each item MUST carry enough identity to act on
it (departure id, package id, package title, departure date, seats remaining; needs-push
items also carry days-until-departure).

#### Scenario: Almost-full departures surface as urgent closing
- **WHEN** the tenant has departures with status `almost_full`
- **THEN** they appear in the urgent-closing list with seats remaining

#### Scenario: Departures within 45 days with seats surface as needs push
- **WHEN** the tenant has open/almost-full departures dated within the next 45 days that still have seats
- **THEN** they appear in the needs-push list with days-until-departure

#### Scenario: Past, full, departed, or cancelled departures are excluded
- **WHEN** a departure is in the past, `full`, `departed`, or `cancelled`
- **THEN** it does not appear in the needs-push list

### Requirement: Recent activity in the summary

The summary SHALL include a short recent-activity list of the tenant's most recently
created or updated packages (bounded, e.g. up to 5), each with enough identity to link to
its detail page (id, title, status, timestamp).

#### Scenario: Recent packages are listed
- **WHEN** the tenant has recently created or updated packages
- **THEN** the summary includes up to the bounded number of them, most recent first

#### Scenario: No packages yet
- **WHEN** the tenant has no packages
- **THEN** the recent-activity list is empty and the dashboard renders an empty state

### Requirement: Dashboard home shows real operational content

The admin dashboard landing screen SHALL present the summary as KPI figures with quick
actions (e.g. new package, manage providers, master data, search), the two operational
lists (urgent closing, needs push), and the recent-activity list. It MUST NOT display
developer-facing starter-kit content anywhere in the admin.

#### Scenario: Admin opens the dashboard
- **WHEN** an admin opens `/dashboard`
- **THEN** they see real KPI counts, quick actions, the urgent-closing and needs-push lists, and recent activity

#### Scenario: No starter-kit scaffolding remains
- **WHEN** any admin screen (dashboard home, users) is rendered
- **THEN** no "reference code", `/comet` how-to, "MISSION CONTROL", or "worked CRUD example" copy is present

