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
