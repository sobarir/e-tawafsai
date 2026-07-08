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
recent-activity list, using existing UI primitives and the dashboard's telemetry aesthetic).
Remove the scaffolding copy block from `users/page.tsx` (keep the functional table/form).

## Risks / Trade-offs

- **[Public data over-exposure]** → Trimmed DTO built by an explicit mapper + spec scenario
  asserting no internal fields; endpoint filters `status = 'published'` only.
- **[Public endpoint + tenant middleware assumption]** → The middleware only host-resolves
  when there is no `Authorization` header; the web calls it anonymously (cookie-less on the
  landing), so host resolution applies. Verified against `tenant-resolution` behavior. Add
  an integration test for anonymous host-scoped access.
- **[Abuse / unauthenticated load]** → Out of scope to rate-limit now; endpoint is read-only,
  returns bounded published data only. Noted as a follow-up, not a blocker.
- **[KPI query cost]** → Counts are simple indexed aggregates over tenant-scoped tables;
  negligible at current scale.

## Migration Plan

No DB migration. Deploy is additive (two new endpoints + shared types) plus web wiring.
Rollback = revert; the admin `/search/packages` path is untouched, so no data risk. After
deploy, verify anonymous `/` renders featured packages and admin `/dashboard` shows counts.

## Open Questions

- Public list size N for the landing (current design pulls 6) — confirm during build.
- Whether the public endpoint should also power a future public package-detail page — out
  of scope now; DTO is shaped so it could be extended later.
