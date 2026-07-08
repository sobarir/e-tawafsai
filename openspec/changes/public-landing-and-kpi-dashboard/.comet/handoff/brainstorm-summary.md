# Brainstorm Summary

- Change: public-landing-and-kpi-dashboard
- Date: 2026-07-08

## Confirmed Technical Approach

Two new capabilities, one change, no DB/migration changes, no new deps.

**public-catalog (anonymous landing):**
- New `public` Nest module, unguarded `GET /public/packages` (no JwtAuthGuard). Tenant
  scoping from the existing `TenantResolutionMiddleware` (host → tenant when no
  Authorization header). Verified this middleware already host-resolves for anon requests.
- Service reuses the search service's SQL shape (lateral join to earliest matching
  departure → `price_from`, `seats_left`), filters `status = 'published'`, orders
  `isFeatured desc, createdAt desc`, limit 6.
- Typed `toPublicPackageCardDto` mapper emits only marketing-safe fields (title, slug,
  hotels[{cityName,name,stars,distanceM,isPelataran}], airlineName, nearestDepartureDate,
  startingPriceIdr, seatsAvailable). No internal fields.
- Web: `usePublicFeaturedPackages()` → `FeaturedPackages` switches off guarded search;
  `PackageCard` adapts to `PublicPackageCardDto`. Admin `useSearchPackages` untouched.

**admin-dashboard:**
- New `dashboard` module, admin-guarded `GET /dashboard/summary`, tenant-scoped, one
  `DashboardSummaryDto`:
  - counts: packages{total,published,draft}; departures{upcoming,almostFull,openSeats=
    Σ(seatTotal−seatBooked−seatHeld)}; providers{total,active}
  - urgentClosing (status `almost_full`) + needsPush (date ≤ +45d, status open/almost_full,
    seats>0, with daysUntil) — CONFIRMED to keep these operational widgets
  - recentPackages (bounded 5)
- Web: rebuild `dashboard/page.tsx` (KPI tiles + quick actions + two ops lists + recent
  activity; isPending/isError states); strip scaffolding copy from `users/page.tsx`.

## Key Trade-offs and Risks

- Public over-exposure (MAIN risk) → trimmed DTO via explicit mapper + spec scenario
  asserting no internal fields; `published`-only filter.
- Public endpoint has no rate-limiting → accepted for now (read-only, bounded,
  published-only); noted as follow-up, not a blocker.
- Zero regression surface on admin search (`/search/packages` untouched); no schema change.

## Testing Strategy

- Unit (DB-free): public mapper (no internal fields, published-only, featured-first +
  recent fallback ordering); summary shaping (count/list bounds, needs-push date/seat filter).
- Integration: anon host-scoped `/public/packages` → published-only marketing-safe, never
  401; `/dashboard/summary` → 401 anon, tenant-scoped counts + ops lists + recent activity.
- Verify live smoke: anon `/` renders featured packages, no redirect; admin `/dashboard`
  shows counts + ops lists.

## Spec Patches

Written back to `specs/admin-dashboard/spec.md`:
- ADDED "Operational signal lists in the summary" requirement (urgent-closing + needs-push
  + exclusion scenario for past/full/departed/cancelled).
- Amended "Dashboard home shows real operational content" to include the two ops lists.
No changes to `specs/public-catalog/spec.md`.
