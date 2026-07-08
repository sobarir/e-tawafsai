# Comet Design Handoff

- Change: public-landing-and-kpi-dashboard
- Phase: design
- Mode: compact
- Context hash: fb83f0920f3fde6f4624d0ddce6169e12032edaf2e611177b59f1df07b4eb0cf

Generated-by: comet-handoff.sh

OpenSpec remains the canonical capability spec. This handoff is a deterministic, source-traceable context pack, not an agent-authored summary.

## openspec/changes/public-landing-and-kpi-dashboard/proposal.md

- Source: openspec/changes/public-landing-and-kpi-dashboard/proposal.md
- Lines: 1-55
- SHA256: b80f45e74964e5012bdd1dbc1e50d0c380a6ec97fe15b3d198e02a0e6baffefb

```md
## Why

The redesigned consumer landing page (`/`) is unreachable for anonymous visitors: its
`FeaturedPackages` section calls the JWT-guarded `GET /search/packages`, which returns
401 for logged-out users, and the global session-expiry hook then redirects them to
`/login?expired=1`. Every prospective customer is bounced to a login screen with a
misleading "session expired" message — defeating the entire point of the marketing
redesign. Separately, the admin still opens onto CometKit starter-kit scaffolding
("This dashboard is reference code…", a `/comet` how-to card, "worked CRUD example…")
instead of a real operational home. Both must be fixed for the app to be usable by real
visitors and real agency staff.

## What Changes

- Add a **public, unauthenticated** endpoint that returns a tenant's published packages
  for the landing page, using the existing host-based tenant resolution and exposing
  only **marketing-safe fields**. Featured packages are returned first, falling back to
  recent published packages so the section is never empty when packages exist.
- Repoint the landing's featured-packages data hook from the guarded `/search/packages`
  to the new public endpoint, so anonymous visitors never trigger the 401→login redirect.
- Add an admin-guarded **dashboard summary** endpoint aggregating real counts from
  `packages`, `departures`, and `providers`, plus a small recent-activity list.
- Rebuild `dashboard/page.tsx` into a real KPI home (counts, quick actions, recent
  activity) and remove the developer-facing scaffolding copy from `dashboard/page.tsx`
  and `users/page.tsx`.

## Capabilities

### New Capabilities
- `public-catalog`: Unauthenticated, host-tenant-scoped access to a tenant's published
  packages for the public landing page, returning only marketing-safe fields
  (featured-first with recent-published fallback).
- `admin-dashboard`: The authenticated admin home — a summary/KPI endpoint over existing
  entities and the dashboard landing screen that consumes it (counts, quick actions,
  recent activity).

### Modified Capabilities
<!-- None: admin search stays guarded and unchanged; the global session-expiry redirect
     (session-expiry-redirect spec) is intentionally left as-is — the public endpoint
     simply never returns 401, so no requirement changes there. -->

## Impact

- **API (new, no auth):** a `public` package endpoint reusing `TenantResolutionMiddleware`
  (host → tenant) and a trimmed, marketing-safe DTO derived from published packages.
- **API (new, admin-guarded):** a dashboard-summary endpoint aggregating package /
  departure / provider counts + recent activity.
- **Shared:** new response types (public package card DTO, dashboard summary DTO) in
  `packages/shared`; no new persisted shapes (`packages/db` unchanged).
- **Web:** landing `FeaturedPackages` hook switches to the public endpoint;
  `dashboard/page.tsx` rebuilt; `users/page.tsx` scaffolding copy removed.
- **Security consideration:** the public DTO must exclude internal fields (commission,
  category internals, DP/pricing internals, provider internal identifiers) and expose
  only published packages.
- **No data model / migration changes**; no new third-party dependencies.
```

## openspec/changes/public-landing-and-kpi-dashboard/design.md

- Source: openspec/changes/public-landing-and-kpi-dashboard/design.md
- Lines: 1-107
- SHA256: 72058b5becacfb820bc3a253c01b18aebfb997c8d8f5f8dc5ddfcd6124c3036d

[TRUNCATED]

```md
## Context

The consumer landing page was redesigned (black+gold Umrah aesthetic) but its
`FeaturedPackages` component fetches through `useSearchPackages` → `GET /search/packages`,
which is guarded by `JwtAuthGuard` + `@Roles("admin","staff")`. Anonymous visitors get
`401`; the global ky `beforeError` hook (`apps/web/src/lib/api.ts` +
`session-redirect.ts`) then hard-navigates to `/login?expired=1`. Net effect: the public
site is unreachable for the public.

Separately, `apps/web/src/app/dashboard/page.tsx` still renders CometKit starter-kit
content ("This dashboard is reference code…", a `/comet` how-to card, "MISSION CONTROL"),
and `users/page.tsx` shows "worked CRUD example…". The API exposes real entities to build
a genuine home: `packages` (status draft/published/archived, `isFeatured`), `departures`
(status open/almost_full/full/departed/cancelled, seat counts), `providers` (active flag).
There is **no** bookings/leads module, so KPIs are built from packages/departures/providers.

Key existing seam: `TenantResolutionMiddleware` already resolves the tenant from the
request host (`x-forwarded-host`/`host`) for **any request without an `Authorization`
header** and sets it in CLS. So an unguarded endpoint gets correct tenant scoping for free.

## Goals / Non-Goals

**Goals:**
- Anonymous visitors can load `/` and see real featured packages, with no 401 and no
  login redirect.
- A public endpoint returns only published, marketing-safe package data, featured-first
  with recent-published fallback.
- The admin dashboard home shows real KPIs (packages/departures/providers), quick actions,
  and recent activity, via one admin-guarded summary endpoint.
- All developer-facing scaffolding copy is removed from the admin.

**Non-Goals:**
- No new bookings/leads entity, no analytics/charts, no consumer package-detail page.
- No change to the global 401→login redirect logic (correct for real sessions; the public
  endpoint simply never 401s).
- No change to the admin `GET /search/packages` (stays guarded).
- No DB schema or migration changes; no new dependencies.

## Decisions

### D1 — Public data path: a new unguarded endpoint (not "make search public")
Add a dedicated public controller, e.g. `GET /public/packages` (a small `public` Nest
module, or a public controller within `packages`), with **no** `JwtAuthGuard`. Tenant is
resolved by the existing `TenantResolutionMiddleware` from the host.
- **Why over alternatives:** Making `/search/packages` public would over-expose the rich
  admin search DTO (commission, category, internal fields) and entangle admin RBAC with
  public access. A separate endpoint keeps a **narrow, intentional** public surface and a
  trimmed DTO.
- **Rejected — client-only fix (exempt landing fetch from redirect):** the fetch would
  still 401 and the featured section would always be empty; it does not deliver the data.

### D2 — Trimmed, marketing-safe public DTO in `packages/shared`
Define a `PublicPackageCardDto` (title, slug, hotels[{cityName,name,stars,distanceM,
isPelataran}], airlineName, nearestDepartureDate, startingPriceIdr, seatsAvailable) via a
typed mapper in the service (mirrors the `toUserDto` pattern). The public endpoint maps
published packages to this shape only — internal fields never enter the payload.
- **Why:** wire shapes live in `shared` (DRY rule); a typed mapper makes field exposure
  explicit and drift a compile error.

### D3 — Ordering: featured-first, recent-published fallback
Query published packages, order `isFeatured desc, createdAt desc`, limit N. This satisfies
"featured first" and "never empty when published exist" in one query without a second round
trip.

### D4 — Landing hook repoint
Add `usePublicFeaturedPackages()` in web hooks calling `/public/packages`; `FeaturedPackages`
switches to it. The `PackageCard` UI already renders from a card-shaped object; adapt the
mapping to `PublicPackageCardDto`. The admin `useSearchPackages` is untouched.

### D5 — Admin KPI: one aggregate endpoint `GET /dashboard/summary`
Admin-guarded (`JwtAuthGuard` + `RolesGuard`, roles admin/staff), tenant-scoped. Returns a
`DashboardSummaryDto`: `{ packages:{total,published,draft}, departures:{upcoming,almostFull,
openSeats}, providers:{total,active}, recentPackages:[{id,title,status,updatedAt}] }`.
- **Why over client-side aggregation:** one round trip, no reliance on list endpoints that
  don't all exist, counts computed in SQL (COUNT/SUM) rather than fetching rows.
- **Placement:** a small `dashboard` module (controller+service), consistent with the
  per-domain module layout.

### D6 — Dashboard/users de-scaffolding
Rebuild `dashboard/page.tsx` to consume the summary (KPI tiles + quick-action links +
```

Full source: openspec/changes/public-landing-and-kpi-dashboard/design.md

## openspec/changes/public-landing-and-kpi-dashboard/tasks.md

- Source: openspec/changes/public-landing-and-kpi-dashboard/tasks.md
- Lines: 1-42
- SHA256: 5d164802ece9f856b25e1d8a9f5f42390afd3856fbc8e67933458269f8998a2c

```md
# Tasks — public-landing-and-kpi-dashboard

Manual gating applies: stop after each task, commit + tick the box, then ask before the
next. A single `/code-review` runs only after ALL tasks are complete.

## 1. Shared contracts

- [ ] 1.1 Add `PublicPackageCardDto` (marketing-safe: title, slug, hotels[{cityName,name,stars,distanceM,isPelataran}], airlineName, nearestDepartureDate, startingPriceIdr, seatsAvailable) and its response type to `packages/shared`.
- [ ] 1.2 Add `DashboardSummaryDto` (`packages:{total,published,draft}`, `departures:{upcoming,almostFull,openSeats}`, `providers:{total,active}`, `recentPackages:[{id,title,status,updatedAt}]`) to `packages/shared`.

## 2. Public catalog API (unauthenticated)

- [ ] 2.1 Add a service method that returns a tenant's `published` packages, ordered featured-first then recent (`isFeatured desc, createdAt desc`, limit N), mapped via a typed `toPublicPackageCardDto` mapper that exposes only marketing-safe fields.
- [ ] 2.2 Add an unguarded public controller (e.g. `GET /public/packages`) — no `JwtAuthGuard` — relying on `TenantResolutionMiddleware` for host→tenant scoping; register its module in `app.module.ts`.
- [ ] 2.3 Unit spec for the public mapper + ordering/fallback (pure logic; asserts no internal fields, featured-first, published-only).

## 3. Landing wiring (web)

- [ ] 3.1 Add `usePublicFeaturedPackages()` hook calling `/public/packages` via the shared `api` instance.
- [ ] 3.2 Repoint `FeaturedPackages` from `useSearchPackages` to the public hook and adapt `PackageCard` to render `PublicPackageCardDto` (keep the existing card layout + WhatsApp CTA).

## 4. Dashboard summary API (admin-guarded)

- [ ] 4.1 Add a dashboard service aggregating tenant-scoped counts (packages by status; upcoming/almost-full departures + open seats; providers total/active) and a bounded recent-packages list.
- [ ] 4.2 Add `GET /dashboard/summary` controller guarded by `JwtAuthGuard` + `RolesGuard` (`@Roles("admin","staff")`); register the `dashboard` module in `app.module.ts`.
- [ ] 4.3 Unit spec for the summary shaping (pure logic; counts/recent-list bounds).

## 5. Dashboard home + de-scaffold (web)

- [ ] 5.1 Add `useDashboardSummary()` hook calling `/dashboard/summary`.
- [ ] 5.2 Rebuild `dashboard/page.tsx` into a real home: KPI tiles, quick-action links (new package, providers, master data, search), recent-activity list — with `isPending`/`isError` states — removing all starter-kit copy (`reference code`, `/comet` card, `MISSION CONTROL`).
- [ ] 5.3 Remove the "worked CRUD example / FEATURE_PATTERN.md" scaffolding copy from `users/page.tsx` (keep the functional table + create form).

## 6. Integration tests

- [ ] 6.1 Int spec: anonymous, host-scoped `GET /public/packages` returns only `published` packages with marketing-safe fields (no internal fields) and never 401s.
- [ ] 6.2 Int spec: `GET /dashboard/summary` requires auth (401 anonymous) and returns tenant-scoped counts + recent activity for the authenticated tenant.

## 7. Verify

- [ ] 7.1 `bun run verify` (typecheck + lint + test) and `bun run test:int` green; live smoke: anonymous `/` renders featured packages with no login redirect, and admin `/dashboard` shows real KPI counts.
- [ ] 7.2 Single `/code-review` pass over the whole change (manual-gating rule: only after all tasks complete).
```

## openspec/changes/public-landing-and-kpi-dashboard/specs/admin-dashboard/spec.md

- Source: openspec/changes/public-landing-and-kpi-dashboard/specs/admin-dashboard/spec.md
- Lines: 1-73
- SHA256: 448b28f41e724dc4b7ea9cef10db05df8645162953ae3fd4a49c8cb0825a5678

```md
## ADDED Requirements

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
```

## openspec/changes/public-landing-and-kpi-dashboard/specs/public-catalog/spec.md

- Source: openspec/changes/public-landing-and-kpi-dashboard/specs/public-catalog/spec.md
- Lines: 1-54
- SHA256: fb5bf243db4ededd60eda3885d863089d17134486bff9de92f577a8df6ee523c

```md
## ADDED Requirements

### Requirement: Public featured packages are reachable without authentication

The system SHALL expose a public, unauthenticated endpoint that returns a tenant's
published packages for the consumer landing page. The endpoint MUST resolve the tenant
from the request host (via the existing host-based tenant resolution) and MUST NOT
require a JWT, session cookie, or any role.

#### Scenario: Anonymous visitor loads featured packages
- **WHEN** a request with no authentication reaches the public featured-packages endpoint
- **THEN** the system resolves the tenant from the request host
- **AND** responds `200` with that tenant's published packages (no redirect, no 401)

#### Scenario: Anonymous landing page never redirects to login
- **WHEN** an anonymous visitor opens the landing page and it fetches featured packages
- **THEN** the response is a success (not `401`)
- **AND** the visitor is NOT redirected to `/login` and sees no "session expired" notice

### Requirement: Public endpoint returns only published, marketing-safe data

The endpoint SHALL return only packages whose status is `published`. Each item MUST
expose only marketing-safe fields (title, slug, hotels with city/stars/distance, airline
name, nearest departure date, starting price, seats available) and MUST NOT expose
internal fields such as commission, category internals, deposit/pricing internals, or
internal provider identifiers.

#### Scenario: Draft and archived packages are excluded
- **WHEN** the public endpoint is queried for a tenant that has draft or archived packages
- **THEN** only `published` packages appear in the response

#### Scenario: Internal fields are not leaked
- **WHEN** the public endpoint returns a package
- **THEN** the payload contains only marketing-safe fields
- **AND** contains no commission, category-internal, deposit/pricing-internal, or internal provider identifier fields

### Requirement: Featured-first ordering with recent-published fallback

The endpoint SHALL return featured packages first. When the tenant has fewer featured
packages than the requested limit, the system SHALL fill the remainder with the most
recent published packages so the landing section is never empty while published packages
exist.

#### Scenario: Featured packages exist
- **WHEN** the tenant has packages marked featured
- **THEN** featured packages appear first in the response

#### Scenario: No featured packages but published ones exist
- **WHEN** the tenant has published packages but none are marked featured
- **THEN** the response returns recent published packages (a non-empty list)

#### Scenario: No published packages
- **WHEN** the tenant has no published packages
- **THEN** the response is an empty list and the landing renders its empty state (still no redirect)
```

