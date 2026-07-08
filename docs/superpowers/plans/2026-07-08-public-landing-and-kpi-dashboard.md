---
change: public-landing-and-kpi-dashboard
design-doc: docs/superpowers/specs/2026-07-08-public-landing-and-kpi-dashboard-design.md
base-ref: 6f1fc8fe2b8002d7d8af9dcf063d68c0578f8ad7
---

# Public landing access + real KPI dashboard — Implementation Plan

> **For agentic workers:** This plan is executed under Comet `build_mode: direct` with
> manual gating — one task per commit, stop after each task and wait for approval. Steps
> use checkbox (`- [ ]`) syntax for tracking. Canonical requirements:
> `openspec/changes/public-landing-and-kpi-dashboard/specs/{public-catalog,admin-dashboard}/spec.md`.

**Goal:** Make the consumer landing page reachable by anonymous visitors (via a public,
marketing-safe packages endpoint) and replace the admin's starter-kit scaffolding with a
real KPI dashboard home.

**Architecture:** New unguarded `GET /public/packages` (host-tenant-scoped via existing
`TenantResolutionMiddleware`, published-only, trimmed DTO). New admin-guarded
`GET /dashboard/summary` aggregating packages/departures/providers + operational lists.
Web repoints the landing hook and rebuilds `dashboard/page.tsx`; scaffolding copy removed.

**Tech Stack:** NestJS (Fastify) + Drizzle/Postgres API, Next.js 15 App Router + TanStack
Query + ky web, Zod 4 + shared TS types, Vitest (unit + integration), bun.

## Global Constraints

- Wire shapes live in `packages/shared`; columns in `packages/db`; never redeclare.
- API errors via Nest `HttpException` subclasses; no try/catch shaping in controllers.
- DTOs built by typed mappers (mirror `toUserDto`); the mapper is the only place public
  field exposure is decided.
- Services log domain events: `this.logger.info({...}, "noun.verb")`.
- New runtime imports must be declared in that package's `package.json` (bun isolated linker).
- Nest route order: static segments before parameterized.
- Tests: pure unit specs (`*.spec.ts`, DB-free) run in `verify`; integration
  (`*.int.spec.ts`) hit real Postgres via `bun run test:int` and clean up their own rows.
- Admin `GET /search/packages` stays guarded and unchanged. No DB/migration changes.
- `bun run verify` (typecheck+lint+test) must pass before leaving build.
- bun on bash PATH: `export PATH="/c/Users/rahma/.bun/bin:$PATH"`.

---

### Task 1.1: Shared `PublicPackageCardDto`

**Files:**
- Create: `packages/shared/src/public-catalog.ts`
- Modify: `packages/shared/src/index.ts` (add `export * from "./public-catalog";`)

**Interfaces — Produces:**
```ts
export interface PublicPackageHotel {
  cityName: string; name: string; stars: number;
  distanceM: number | null; isPelataran: boolean;
}
export interface PublicPackageCardDto {
  title: string; slug: string;
  category: string | null;
  airline: string | null;
  hotels: PublicPackageHotel[];
  nearestDepartureDate: string | null; // ISO or null when no upcoming departure
  startingPriceIdr: number | null;      // min price_quad across upcoming departures, or null
  seatsAvailable: number;               // seats_left of nearest departure, 0 when none
}
```

- [ ] Step 1: Create `public-catalog.ts` with the two interfaces above.
- [ ] Step 2: Add the export line to `index.ts`.
- [ ] Step 3: `export PATH="/c/Users/rahma/.bun/bin:$PATH" && bun run --cwd packages/shared typecheck` → PASS.
- [ ] Step 4: Commit `feat(shared): add PublicPackageCardDto for public landing`.

### Task 1.2: Shared `DashboardSummaryDto`

**Files:**
- Create: `packages/shared/src/dashboard.ts`
- Modify: `packages/shared/src/index.ts` (add `export * from "./dashboard";`)

**Interfaces — Produces:**
```ts
export interface DepartureSignal {
  departureId: string; packageId: string; packageTitle: string;
  departureDate: string; seatsLeft: number;
}
export interface DashboardSummaryDto {
  packages: { total: number; published: number; draft: number };
  departures: { upcoming: number; almostFull: number; openSeats: number };
  providers: { total: number; active: number };
  urgentClosing: DepartureSignal[];
  needsPush: (DepartureSignal & { daysUntil: number })[];
  recentPackages: { id: string; title: string; status: string; updatedAt: string }[];
}
```

- [ ] Step 1: Create `dashboard.ts` with the interfaces above.
- [ ] Step 2: Add the export line to `index.ts`.
- [ ] Step 3: typecheck shared → PASS.
- [ ] Step 4: Commit `feat(shared): add DashboardSummaryDto`.

---

### Task 2.1: Public packages service + mapper (unit-tested)

**Files:**
- Create: `apps/api/src/public/public-packages.service.ts`
- Create: `apps/api/src/public/public-packages.mapper.ts`
- Test: `apps/api/src/public/public-packages.mapper.spec.ts`

**Interfaces — Consumes:** `PublicPackageCardDto`, `PublicPackageHotel` (Task 1.1).
**Produces:**
- `toPublicPackageCardDto(row: PublicPackageRow): PublicPackageCardDto`
- `PublicPackagesService.featured(limit = 6): Promise<PublicPackageCardDto[]>`

**Query notes (mirror `search.service.ts`):** select `packages` where
`tenant_id = <tenantId> AND status = 'published'`; **LEFT JOIN LATERAL** the earliest
upcoming departure (`status in ('open','almost_full')`, `departure_date >= now()`), exposing
`departure_date`, `seats_left = seat_total-seat_booked-seat_held`, and
`price_from = min(price_quad) over ()`; LEFT JOIN LATERAL a hotels json agg that INCLUDES
`is_pelataran`; LEFT JOIN `airlines`, `package_categories`. Order
`p.is_featured desc, p.created_at desc` limit `limit`. LEFT (not INNER) so published
packages without departures still appear (date/price null, seats 0).

- [ ] Step 1: Write `public-packages.mapper.spec.ts` — a DB-free test that feeds a plain
  `PublicPackageRow` and asserts (a) output keys are exactly the `PublicPackageCardDto`
  set (no `provider_name`, `ppiu_license_no`, `commission`, `category_id`, price internals),
  (b) hotels carry `isPelataran`, (c) null nearest departure → `nearestDepartureDate: null`,
  `startingPriceIdr: null`, `seatsAvailable: 0`.

```ts
import { describe, it, expect } from "vitest";
import { toPublicPackageCardDto, type PublicPackageRow } from "./public-packages.mapper";

const row: PublicPackageRow = {
  title: "Umrah Akbar", slug: "umrah-akbar", category: "Regular", airline: "Saudia",
  hotels: [{ cityName: "Makkah", name: "Swissotel", stars: 5, distanceM: 50, isPelataran: true }],
  next_departure_date: "2026-08-14T00:00:00.000Z", price_from: 35000000, seats_left: 45,
};

describe("toPublicPackageCardDto", () => {
  it("emits only marketing-safe fields", () => {
    const dto = toPublicPackageCardDto(row);
    expect(Object.keys(dto).sort()).toEqual(
      ["airline","category","hotels","nearestDepartureDate","seatsAvailable","slug","startingPriceIdr","title"]
    );
    expect(dto.hotels[0]).toHaveProperty("isPelataran", true);
  });
  it("handles a package with no upcoming departure", () => {
    const dto = toPublicPackageCardDto({ ...row, next_departure_date: null, price_from: null, seats_left: 0 });
    expect(dto.nearestDepartureDate).toBeNull();
    expect(dto.startingPriceIdr).toBeNull();
    expect(dto.seatsAvailable).toBe(0);
  });
});
```

- [ ] Step 2: Run `export PATH="/c/Users/rahma/.bun/bin:$PATH" && bun run --cwd apps/api test public-packages.mapper` → FAIL (module missing).
- [ ] Step 3: Implement `public-packages.mapper.ts` (`PublicPackageRow` type + `toPublicPackageCardDto` returning exactly the DTO keys; `nearestDepartureDate` = row date ? `new Date(...).toISOString()` : null).
- [ ] Step 4: Implement `public-packages.service.ts` (`featured(limit=6)` using `this.tenantDb.tenantId`, the LEFT-lateral SQL above via `this.db.execute(sql\`...\`)`, map rows with `toPublicPackageCardDto`; `this.logger.info({ count }, "public.packages.listed")`).
- [ ] Step 5: Run the mapper test → PASS.
- [ ] Step 6: Commit `feat(api): public packages service + marketing-safe mapper`.

### Task 2.2: Public controller (unguarded) + module

**Files:**
- Create: `apps/api/src/public/public-packages.controller.ts`
- Create: `apps/api/src/public/public.module.ts`
- Modify: `apps/api/src/app.module.ts` (import + register `PublicModule`)

**Interfaces — Consumes:** `PublicPackagesService.featured` (Task 2.1).

- [ ] Step 1: Controller — `@Controller("public/packages")`, **no** `@UseGuards`; single
  `@Get()` returning `this.service.featured(6): Promise<PublicPackageCardDto[]>`.
- [ ] Step 2: `public.module.ts` provides `PublicPackagesService`, declares the controller.
  (Tenant context comes from the app-wide `TenantResolutionMiddleware`; verify it's applied
  to all routes — it is, via `AppModule` middleware config — no per-module wiring needed.)
- [ ] Step 3: Register `PublicModule` in `app.module.ts` imports.
- [ ] Step 4: `bun run --cwd apps/api typecheck` → PASS.
- [ ] Step 5: Manual smoke: `curl -s -H 'X-Forwarded-Host: localhost:3000' http://localhost:3002/public/packages` → `200`, JSON array, no internal fields.
- [ ] Step 6: Commit `feat(api): unguarded GET /public/packages endpoint`.

---

### Task 3.1: Web hook `usePublicFeaturedPackages`

**Files:**
- Create: `apps/web/src/hooks/use-public-packages.ts`

**Interfaces — Produces:** `usePublicFeaturedPackages(): UseQueryResult<PublicPackageCardDto[]>`.

- [ ] Step 1: Implement the hook (query key `["public-packages"]`, `queryFn: () =>
  api.get("public/packages").json<PublicPackageCardDto[]>()`).
- [ ] Step 2: `bun run --cwd apps/web typecheck` → PASS.
- [ ] Step 3: Commit `feat(web): usePublicFeaturedPackages hook`.

### Task 3.2: Repoint landing to the public endpoint

**Files:**
- Modify: `apps/web/src/components/landing/featured-packages.tsx`
- Modify: `apps/web/src/components/landing/package-card.tsx` (retype prop to the public DTO)

**Interfaces — Consumes:** `usePublicFeaturedPackages` (3.1), `PublicPackageCardDto` (1.1).

- [ ] Step 1: In `package-card.tsx`, change the prop type from `SearchResultDto` to a
  minimal view the card reads: retype `result` to `PublicPackageCardDto` and map fields —
  `priceFrom → startingPriceIdr` (guard null → hide price / show "Hubungi kami"),
  `nextDepartureDate → nearestDepartureDate`, keep `title/category/seatsAvailable/hotels/airline`.
  Update the `seatsAvailable`/price render to tolerate null.
- [ ] Step 2: In `featured-packages.tsx`, swap `useSearchPackages({page:1,pageSize:6})` for
  `usePublicFeaturedPackages()`; the loading skeleton stays; map `data` (array, not
  `data.data`) into `PackageCard`.
- [ ] Step 3: `bun run --cwd apps/web typecheck && bun run --cwd apps/web lint` → PASS.
- [ ] Step 4: Smoke: with web on `:3000`→`:3002`, load `/` **logged out** → featured
  packages render, no redirect to `/login`.
- [ ] Step 5: Commit `feat(web): landing featured packages use public endpoint`.

---

### Task 4.1: Dashboard summary service (unit-tested shaping)

**Files:**
- Create: `apps/api/src/dashboard/dashboard.service.ts`
- Test: `apps/api/src/dashboard/dashboard.service.spec.ts` (pure shaping helpers only)

**Interfaces — Consumes:** `DashboardSummaryDto`, `DepartureSignal` (Task 1.2).
**Produces:** `DashboardService.summary(): Promise<DashboardSummaryDto>` and a pure helper
`daysUntil(date: Date, now: Date): number` (for needs-push), unit-tested.

- [ ] Step 1: Write `dashboard.service.spec.ts` testing pure helpers: `daysUntil` returns
  ceil-days difference; a `toDepartureSignal(row)` mapper shape. (No DB.)
- [ ] Step 2: Run test → FAIL.
- [ ] Step 3: Implement `dashboard.service.ts`:
  - counts via `this.db.execute(sql\`...\`)` grouped, all `where tenant_id = <tenantId>`:
    packages total/published/draft; departures upcoming (`status in ('open','almost_full') and departure_date >= now()`), almostFull (`status='almost_full'`), openSeats (`sum(seat_total-seat_booked-seat_held)` over upcoming);
    providers total/active (`is_active`).
  - `urgentClosing`: departures `status='almost_full'` join packages for title, bounded (e.g. 10), order by departure_date asc.
  - `needsPush`: departures `departure_date between now() and now()+interval '45 days' and status in ('open','almost_full') and (seat_total-seat_booked-seat_held) > 0`, with `daysUntil`, bounded.
  - `recentPackages`: latest 5 by `updated_at`.
  - `this.logger.info({}, "dashboard.summary.read")`.
- [ ] Step 4: Run test → PASS.
- [ ] Step 5: Commit `feat(api): dashboard summary service`.

### Task 4.2: Dashboard controller (admin-guarded) + module

**Files:**
- Create: `apps/api/src/dashboard/dashboard.controller.ts`
- Create: `apps/api/src/dashboard/dashboard.module.ts`
- Modify: `apps/api/src/app.module.ts` (register `DashboardModule`)

- [ ] Step 1: Controller `@Controller("dashboard")` `@UseGuards(JwtAuthGuard, RolesGuard)`;
  `@Get("summary") @Roles("admin","staff")` → `this.service.summary()`.
- [ ] Step 2: `dashboard.module.ts` (provider + controller); register in `app.module.ts`.
- [ ] Step 3: `bun run --cwd apps/api typecheck` → PASS.
- [ ] Step 4: Smoke: authed `curl` to `:3002/dashboard/summary` → `200` with counts;
  anonymous → `401`.
- [ ] Step 5: Commit `feat(api): admin GET /dashboard/summary endpoint`.

---

### Task 5.1: Web hook `useDashboardSummary`

**Files:** Create `apps/web/src/hooks/use-dashboard.ts`.

- [ ] Step 1: Implement (`["dashboard-summary"]`, `api.get("dashboard/summary").json<DashboardSummaryDto>()`).
- [ ] Step 2: typecheck web → PASS. Commit `feat(web): useDashboardSummary hook`.

### Task 5.2: Rebuild `dashboard/page.tsx`

**Files:** Modify `apps/web/src/app/dashboard/page.tsx`.

**Interfaces — Consumes:** `useDashboardSummary` (5.1).

- [ ] Step 1: Replace the page body with: header (keep nav buttons), a KPI tile row
  (packages published/draft, upcoming departures, open seats, providers active), quick-action
  links (`/dashboard/packages/new`, `/dashboard/providers`, `/dashboard/settings/master-data`,
  `/dashboard/search`), the **urgent-closing** and **needs-push** lists, and **recent
  packages** (link each to `/dashboard/packages/{id}`). Handle `isPending` (skeleton/text)
  and `isError` (render `readApiError` in a `role="alert"`). Remove ALL scaffolding copy
  ("reference code", `/comet` card, "MISSION CONTROL", "Identity/Next step" cards).
- [ ] Step 2: `bun run --cwd apps/web typecheck && lint` → PASS.
- [ ] Step 3: Smoke: admin `/dashboard` shows counts + ops lists; no scaffolding copy.
- [ ] Step 4: Commit `feat(web): real KPI dashboard home`.

### Task 5.3: De-scaffold `users/page.tsx`

**Files:** Modify `apps/web/src/app/dashboard/users/page.tsx`.

- [ ] Step 1: Remove the "The worked CRUD example - see docs/FEATURE_PATTERN.md…" subtitle
  (replace with a plain one-line description or nothing). Keep the table + create form.
- [ ] Step 2: typecheck/lint web → PASS. Commit `chore(web): remove starter-kit copy from users page`.

---

### Task 6.1: Integration — public endpoint

**Files:** Create `apps/api/src/public/public-packages.service.int.spec.ts`.

- [ ] Step 1: Seed a tenant with one published + one draft package (draft must not appear);
  call the service with that tenant context; assert only the published package returns,
  payload has no internal keys, and (separately) that the controller path requires no auth
  (a request without a token is not 401). Clean up rows in `afterAll`.
- [ ] Step 2: `bun run --cwd apps/api test:int public-packages` → PASS. Commit.

### Task 6.2: Integration — dashboard summary

**Files:** Create `apps/api/src/dashboard/dashboard.service.int.spec.ts`.

- [ ] Step 1: Seed tenant A + tenant B with distinct packages/departures/providers; assert
  A's summary reflects only A's rows (counts + needs-push filtering by date/seats). Clean up.
- [ ] Step 2: `bun run --cwd apps/api test:int dashboard` → PASS. Commit.

---

### Task 7.1: Full verify + live smoke

- [ ] Step 1: `export PATH="/c/Users/rahma/.bun/bin:$PATH" && bun run verify` → PASS.
- [ ] Step 2: `bun run --cwd apps/api test:int` → PASS (all integration green).
- [ ] Step 3: Live smoke (web `:3000`→`:3002`): anonymous `/` renders featured packages,
  no login redirect; admin `/dashboard` shows real counts + urgent-closing/needs-push.
- [ ] Step 4: Commit any smoke-driven fixes (or note "no fixes needed").

### Task 7.2: Single code-review pass

- [ ] Step 1: After ALL tasks are checked, run one `/code-review` over the whole change.
- [ ] Step 2: Fix CRITICAL findings; record acceptance rationale for any non-CRITICAL
  findings deferred. Commit fixes.

## Self-review notes

- Spec coverage: public-catalog reqs → Tasks 2.1/2.2/3.2/6.1; admin-dashboard reqs (incl.
  operational lists) → Tasks 4.1/4.2/5.2/6.2; de-scaffold → 5.2/5.3. All covered.
- Public DTO leakage guarded by mapper unit test (2.1) + integration (6.1).
- Names consistent: `PublicPackageCardDto`, `DashboardSummaryDto`, `DepartureSignal`,
  `usePublicFeaturedPackages`, `useDashboardSummary`, `featured()`, `summary()`.
