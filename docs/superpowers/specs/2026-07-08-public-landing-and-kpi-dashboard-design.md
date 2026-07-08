---
comet_change: public-landing-and-kpi-dashboard
role: technical-design
canonical_spec: openspec
archived-with: 2026-07-08-public-landing-and-kpi-dashboard
status: final
---

# Public landing access + real KPI dashboard — Technical Design

Canonical requirements live in the OpenSpec delta specs
(`openspec/changes/public-landing-and-kpi-dashboard/specs/{public-catalog,admin-dashboard}/spec.md`).
This document is the implementation design; it does not restate requirements.

## Context

Two real-user blockers, fixed together:

1. **Landing unreachable for anonymous visitors.** `apps/web/src/components/landing/featured-packages.tsx`
   fetches via `useSearchPackages` → `GET /search/packages`, guarded by
   `JwtAuthGuard` + `@Roles("admin","staff")`. Anonymous → `401`; the global ky
   `beforeError` hook (`apps/web/src/lib/api.ts` + `session-redirect.ts`) then
   hard-navigates to `/login?expired=1`. The public marketing site is unreachable.
2. **Admin opens onto scaffolding.** `dashboard/page.tsx` ("reference code", `/comet`
   card, "MISSION CONTROL") and `users/page.tsx` ("worked CRUD example…").

Grounding facts confirmed in code:
- `TenantResolutionMiddleware` (`apps/api/src/tenancy/tenant-resolution.middleware.ts`)
  host-resolves the tenant into CLS for **any request without an `Authorization` header**,
  so an unguarded endpoint is correctly tenant-scoped.
- The search service (`apps/api/src/search/search.service.ts`) already computes
  `price_from` and `seats_left = seat_total - seat_booked - seat_held` via a lateral join
  to the earliest matching departure — reusable for the public endpoint.
- Entities available for KPIs: `packages` (status draft/published/archived, `isFeatured`),
  `departures` (status enum, `seatTotal/seatBooked/seatHeld`), `providers` (active flag).
  **No bookings/leads module** — KPIs derive from these only.

## Goals / Non-Goals

**Goals:** anonymous `/` renders real featured packages with no redirect; a public,
published-only, marketing-safe endpoint; a real admin KPI home (counts + operational
lists + recent activity) from one admin-guarded summary endpoint; remove all scaffolding.

**Non-Goals:** no bookings/leads entity; no charts/analytics; no consumer package-detail
page; no change to the global 401→login redirect (correct for real sessions); no change to
admin `/search/packages`; no DB/migration changes; no new dependencies; no public-endpoint
rate-limiting (follow-up).

## Architecture

### Public catalog

```
Browser (anonymous, no cookie)
  → GET /public/packages           (Next → NEXT_PUBLIC_API_URL)
    → TenantResolutionMiddleware    (host x-forwarded-host → tenantId in CLS)
      → PublicPackagesController    (NO JwtAuthGuard)
        → PublicPackagesService.featured()
            SELECT published packages for tenant
            LATERAL earliest matching departure → price_from, seats_left, nearest date
            ORDER BY is_featured DESC, created_at DESC  LIMIT 6
          → toPublicPackageCardDto()   (marketing-safe fields only)
        → PublicPackageCardDto[]
```

- **Module placement:** a new `apps/api/src/public/` module (controller + service +
  mapper + specs), keeping the public surface narrow and separate from admin RBAC. It may
  reuse query helpers from search, but does not import admin DTOs.
- **DTO (`packages/shared`):** `PublicPackageCardDto = { title, slug, hotels:
  {cityName,name,stars,distanceM,isPelataran}[], airlineName, nearestDepartureDate,
  startingPriceIdr, seatsAvailable }`. The mapper is the single place field exposure is
  decided; adding an internal field to the response would require editing the mapper.
- **Web:** `usePublicFeaturedPackages()` (query key `["public-packages"]`) via the shared
  `api` instance; `FeaturedPackages` consumes it; `PackageCard` maps from the new DTO
  (retaining the existing card layout + WhatsApp CTA phone).

### Admin dashboard

```
Browser (admin cookie)
  → GET /dashboard/summary          (JwtAuthGuard + RolesGuard, roles admin/staff)
    → DashboardService.summary(tenantId)
        packages:   COUNT by status
        departures: upcoming count, almost_full count, SUM(seats_left) upcoming
        providers:  COUNT total/active
        urgentClosing: departures status='almost_full'            (bounded)
        needsPush:     date ≤ now+45d, status in (open,almost_full), seats_left>0 (bounded)
        recentPackages: latest 5 by updated_at
    → DashboardSummaryDto
```

- **Module placement:** new `apps/api/src/dashboard/` module (controller + service +
  spec). Pure aggregation; no writes.
- **DTO (`packages/shared`):** `DashboardSummaryDto = { packages:{total,published,draft},
  departures:{upcoming,almostFull,openSeats}, providers:{total,active},
  urgentClosing: DepartureSignal[], needsPush: (DepartureSignal & {daysUntil:number})[],
  recentPackages: {id,title,status,updatedAt}[] }` where
  `DepartureSignal = {departureId, packageId, packageTitle, departureDate, seatsLeft}`.
- **Web:** `useDashboardSummary()`; `dashboard/page.tsx` rebuilt with KPI tiles, quick
  actions (new package / providers / master data / search), the two ops lists, and recent
  activity — with `isPending` and `isError` states (the latter per the AGENTS.md rule that
  the current list pages violate). Remove scaffolding copy from `users/page.tsx`.

## Key decisions & rationale

- **Separate unguarded endpoint, not "make search public"** — avoids exposing the rich
  admin search DTO and entangling RBAC; keeps a narrow, auditable public surface.
- **Typed mapper for the public DTO** — field exposure is explicit and drift is a compile
  error (mirrors `toUserDto`), the correct defense for the main risk (data leakage).
- **Featured-first + recent fallback in one query** — never-empty guarantee without a
  second round trip.
- **Single aggregate summary endpoint** — one round trip; counts computed in SQL; no
  reliance on list endpoints that don't all exist.

## Testing strategy

- **Unit (DB-free):** `toPublicPackageCardDto` (only marketing-safe keys present;
  published-only; featured-first then recent ordering); summary shaping (count math,
  needs-push date/seat predicate, list bounds).
- **Integration (real Postgres):** anonymous host-scoped `GET /public/packages` returns
  only `published` marketing-safe rows and never `401`; `GET /dashboard/summary` returns
  `401` anonymous and tenant-scoped counts + ops lists + recent activity when authed. Specs
  clean up their own rows.
- **Verify smoke:** anonymous `/` renders featured packages with no login redirect; admin
  `/dashboard` shows real counts and the urgent-closing / needs-push lists.

## Risks / Trade-offs

- **[Public data leakage]** → trimmed DTO + explicit mapper + unit + integration assertions
  that no internal field appears; `published`-only filter.
- **[Unauthenticated load / abuse]** → accepted now; read-only, bounded, published-only;
  rate-limiting is a noted follow-up.
- **[Tenant-middleware assumption]** → the landing calls the endpoint cookie-less/no
  `Authorization`, so host resolution applies; covered by an anonymous integration test.

## Open questions

- Public list size fixed at 6 (matches the current landing grid); revisit only if product
  wants more.
