# Tasks — public-landing-and-kpi-dashboard

Manual gating applies: stop after each task, commit + tick the box, then ask before the
next. A single `/code-review` runs only after ALL tasks are complete.

## 1. Shared contracts

- [x] 1.1 Add `PublicPackageCardDto` (marketing-safe: title, slug, hotels[{cityName,name,stars,distanceM,isPelataran}], airlineName, nearestDepartureDate, startingPriceIdr, seatsAvailable) and its response type to `packages/shared`.
- [x] 1.2 Add `DashboardSummaryDto` (`packages:{total,published,draft}`, `departures:{upcoming,almostFull,openSeats}`, `providers:{total,active}`, `recentPackages:[{id,title,status,updatedAt}]`) to `packages/shared`.

## 2. Public catalog API (unauthenticated)

- [x] 2.1 Add a service method that returns a tenant's `published` packages, ordered featured-first then recent (`isFeatured desc, createdAt desc`, limit N), mapped via a typed `toPublicPackageCardDto` mapper that exposes only marketing-safe fields.
- [x] 2.2 Add an unguarded public controller (e.g. `GET /public/packages`) — no `JwtAuthGuard` — relying on `TenantResolutionMiddleware` for host→tenant scoping; register its module in `app.module.ts`.
- [x] 2.3 Unit spec for the public mapper + ordering/fallback (pure logic; asserts no internal fields, featured-first, published-only).

## 3. Landing wiring (web)

- [x] 3.1 Add `usePublicFeaturedPackages()` hook calling `/public/packages` via the shared `api` instance.
- [x] 3.2 Repoint `FeaturedPackages` from `useSearchPackages` to the public hook and adapt `PackageCard` to render `PublicPackageCardDto` (keep the existing card layout + WhatsApp CTA).

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
