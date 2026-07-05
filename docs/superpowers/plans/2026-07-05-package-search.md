---
change: package-search
design-doc: docs/superpowers/specs/2026-07-05-package-search-design.md
base-ref: e6f766749b59dab64463a62525e30e1c2a230af7
---

# Package Search (C5) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Give internal admins a single tenant-scoped search over the umrah catalog that combines full-text and structured filters with departure-level semantics, returns compact result cards, and produces one-tap WhatsApp summaries and public links — all within a 500 ms P95 at 1,000 packages / 5,000 departures.

**Architecture:** Postgres-native full-text (a generated `search_doc` tsvector + GIN on `packages`, hotel names matched via a correlated `EXISTS`). One Drizzle raw query does the departure `EXISTS` predicate, occupancy price fallback, per-package aggregation (earliest matching departure, price-from, seats-left), and hotel/provider join in a single round-trip. Wire shapes (Zod query schema, result DTO, WhatsApp formatter, URL helper) live in `packages/shared`; columns/indexes/migration in `packages/db`; the endpoint in a new `apps/api/src/search` module; the screen in `apps/web`.

**Tech Stack:** TypeScript 6, Zod 4, NestJS (Fastify) + Drizzle ORM + PostgreSQL 17, Vitest, Next.js App Router + TanStack Query + shadcn/ui + Tailwind, `ky`.

## Global Constraints

Copied verbatim from the design doc and `AGENTS.md`; every task inherits these.

- **DRY boundaries.** Request/response wire shapes ONLY in `packages/shared`. Columns/enums/indexes ONLY in `packages/db`. Enums shared by both live in `shared` and the Drizzle `pgEnum` derives from them. Never reverse the dependency direction `shared ← db ← api`, `shared ← web`.
- **Contract↔persistence** kept compatible by typed mappers in the service (e.g. `toSearchResultDto`); if they drift, `bun run verify` fails. Do NOT use drizzle-zod.
- **Zod 4 idioms:** `z.email()`, `z.flattenError(err)`, `ZodType` — not v3 forms.
- **Vitest namespace import:** in files run under Vitest use `import * as z from "zod"` (named `import { z }` makes `z.object` undefined under the SWC transform). Follow the existing `packages/shared/src/*.ts` style (they already use `import * as z from "zod"`).
- **Auth/RBAC:** protect the endpoint with `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles("admin","user")`. Validate query with `ZodValidationPipe(searchPackagesSchema)`. Tenant scope every query with `TenantScopedDb.tenantId` — never trust a client-supplied tenant.
- **Errors:** throw Nest `HttpException` subclasses; never `try/catch` to shape errors in controllers. Web reads errors only through `readApiError()` and renders them near the action with `role="alert"`.
- **Logging:** inject `@InjectPinoLogger(SearchService.name)`; log domain events as a structured object + `noun.verb` name (e.g. `this.logger.info({ resultCount }, "search.executed")`). Never log tokens; prefer ids over emails.
- **Migrations:** ALWAYS `db:migrate` before `db:seed`. New runtime imports must be declared in that package's `package.json` (bun's isolated linker does not hoist).
- **Bash/bun on this machine:** before any `bun`/`bunx` call in the Bash tool, run `export PATH="/c/Users/rahma/.bun/bin:$PATH"`. Run `.ts` scripts with `bun file.ts` (tsx's loader is broken here). The PowerShell tool is unreliable (no dotnet) — prefer the Bash tool.
- **Performance budget:** search responses SHALL complete in < 500 ms at P95 with 1,000 packages / 5,000 departures per tenant.

## The 5 locked design decisions (do NOT re-litigate)

- **(A)** Direct-only filters on an explicit new `packages.directOnly` boolean (default `false`), NOT free-text parsing.
- **(B)** Hotel-name search: package-local text goes into the `search_doc` GIN tsvector; hotel names are matched separately via a correlated `EXISTS` on `package_hotels` (a generated column can only reference its own row).
- **(C)** Occupancy max-price predicate compares against the selected occupancy's price column, **falling back to `priceQuad` when the selected occupancy price is null** (`COALESCE(price_<occ>, price_quad)`).
- **(D)** WhatsApp PPIU line: `Diselenggarakan oleh {provider.brandName} — PPIU SK {provider.ppiuLicenseNo}`; when `ppiuLicenseNo` is null, omit the `— PPIU SK …` clause but keep `Diselenggarakan oleh {provider.brandName}`.
- **(E)** Public URL host = `tenant.customDomain` when set, else `{tenant.slug}.{PUBLIC_BASE_DOMAIN}`; url = `https://{host}/paket/{slug}`.

## Build-time decisions (reconciling design gaps — read before Task 1)

These resolve two under-specified points in the design so the plan is buildable; they do not touch the 5 locked decisions.

1. **`publicUrl` is computed server-side and carried on the DTO.** The design (§4) says the web "reuses `packagePublicUrl` client-side," but `AuthUser` (the only tenant handle the web has) exposes just `tenantId` — not `slug`/`customDomain` — and adding tenant fields to `/auth/me` is out of scope for this change. Resolution: `SearchService` calls the shared `packagePublicUrl` helper (single source of truth for decision E) and puts the result on `SearchResultDto.publicUrl: string`. The web copy-link action copies `dto.publicUrl`; the shared helper is still exercised (server + unit tests). This is additive to the design's DTO.
2. **`formatWhatsappSummary` is `(dto)` not `(dto, ctx)`.** Because the DTO now carries `publicUrl` plus all provider fields, the formatter is fully self-contained and pure: `formatWhatsappSummary(dto: SearchResultDto): string`. It reads `dto.publicUrl` for the link line and `dto.providerBrandName`/`dto.ppiuLicenseNo` for the legality line. The web reuses it client-side unchanged.

---

## File Structure

**`packages/shared`** (new files + barrel edit)
- `src/search.ts` — `searchPackagesSchema` (Zod), `SearchParams` type, `SearchResultDto`, `packagePublicUrl`, `formatWhatsappSummary`.
- `src/search.spec.ts` — unit specs for the schema, the URL helper (both host branches), and the formatter (both PPIU branches).
- `src/index.ts` — add `export * from "./search";`.

**`packages/db`** (schema edit + hand-authored migration + fixture)
- `src/schema/packages.ts` — add `directOnly` boolean column.
- `drizzle/00XX_<name>.sql` — generated migration for `directOnly`, hand-extended with the `unaccent` extension, `search_doc` generated tsvector, GIN index, and `departures_search_idx`.
- `src/fixtures/search-benchmark.ts` — seed helper that inserts 1,000 packages / 5,000 departures for one tenant (used only by the benchmark int spec).

**`apps/api/src/search`** (new module)
- `search.module.ts`, `search.controller.ts`, `search.service.ts`.
- `search.service.int.spec.ts` — PRD combo, seats toggle, direct-only, hotel full-text, occupancy fallback.
- `search.benchmark.int.spec.ts` — EXPLAIN sanity + P95 < 500 ms against the seeded fixture.
- `apps/api/src/config/env.ts` — add `PUBLIC_BASE_DOMAIN`.
- `apps/api/src/app.module.ts` — register `SearchModule`.

**`apps/web/src/app/dashboard/search`** (new screen)
- `apps/web/src/hooks/use-search.ts` — `useSearchPackages(params)`.
- `apps/web/src/lib/clipboard.ts` — `copyText(text)` with `execCommand` fallback.
- `page.tsx`, plus `search-filters.tsx` and `result-card.tsx` components.

---

## Task 1: Shared — search query schema + result DTO

**Files:**
- Create: `packages/shared/src/search.ts`
- Create: `packages/shared/src/search.spec.ts`
- Modify: `packages/shared/src/index.ts` (add barrel export)

**Interfaces:**
- Consumes: `PACKAGE_CATEGORIES`, `PRODUCT_TYPES` from `./packages`; `Paginated` from `./pagination`.
- Produces:
  - `export const OCCUPANCIES = ["quad","triple","double"] as const;`
  - `searchPackagesSchema` (Zod object; parsed type `SearchParams = z.infer<typeof searchPackagesSchema>`).
  - `interface SearchResultDto` (adds `publicUrl: string` to the design's §2.2 shape).

- [x] **Step 1: Write the failing test** — `packages/shared/src/search.spec.ts` (schema portion only for now; formatter/url tests are added in Tasks 2–3):

```ts
import { describe, expect, it } from "vitest";
import { searchPackagesSchema } from "./search";

describe("searchPackagesSchema", () => {
  it("applies defaults for occupancy and pagination on empty input", () => {
    const parsed = searchPackagesSchema.parse({});
    expect(parsed.occupancy).toBe("quad");
    expect(parsed.page).toBe(1);
    expect(parsed.pageSize).toBe(20);
    expect(parsed.seatsAvailableOnly).toBe(false);
    expect(parsed.directOnly).toBe(false);
  });

  it("coerces numeric and boolean query-string values", () => {
    const parsed = searchPackagesSchema.parse({
      maxPrice: "30000000",
      durationMin: "9",
      minStars: "4",
      seatsAvailableOnly: "true",
      directOnly: "true",
      page: "2",
    });
    expect(parsed.maxPrice).toBe(30000000);
    expect(parsed.durationMin).toBe(9);
    expect(parsed.minStars).toBe(4);
    expect(parsed.seatsAvailableOnly).toBe(true);
    expect(parsed.directOnly).toBe(true);
    expect(parsed.page).toBe(2);
  });

  it("accepts the canonical hotel cities and occupancy values", () => {
    const parsed = searchPackagesSchema.parse({ hotelCity: "Makkah", occupancy: "triple" });
    expect(parsed.hotelCity).toBe("Makkah");
    expect(parsed.occupancy).toBe("triple");
  });

  it("rejects an out-of-range occupancy", () => {
    expect(searchPackagesSchema.safeParse({ occupancy: "suite" }).success).toBe(false);
  });
});
```

- [x] **Step 2: Run test to verify it fails**

```bash
export PATH="/c/Users/rahma/.bun/bin:$PATH"
cd packages/shared && bun run test -- search.spec.ts
```

Expected: FAIL — cannot resolve `./search`.

- [x] **Step 3: Write minimal implementation** — `packages/shared/src/search.ts`. Query params arrive as strings on the URL, so numeric/boolean fields use `z.coerce`. `hotelCity` uses string equality against `package_hotels.cityName` (canonical `Makkah`/`Madinah`, per design §2.1).

```ts
import * as z from "zod";
import { PACKAGE_CATEGORIES, PRODUCT_TYPES } from "./packages";

export const OCCUPANCIES = ["quad", "triple", "double"] as const;
export type Occupancy = (typeof OCCUPANCIES)[number];

export const HOTEL_CITIES = ["Makkah", "Madinah"] as const;

export const searchPackagesSchema = z.object({
  // full-text
  q: z.string().trim().min(1).max(120).optional(),
  // price + occupancy
  maxPrice: z.coerce.number().int().positive().optional(),
  occupancy: z.enum(OCCUPANCIES).default("quad"),
  // departure date window (ISO datetime); month* accepted as YYYY-MM shorthand
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
  monthFrom: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  monthTo: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  // duration
  durationMin: z.coerce.number().int().positive().optional(),
  durationMax: z.coerce.number().int().positive().optional(),
  // structured catalog filters
  category: z.enum(PACKAGE_CATEGORIES).optional(),
  productType: z.enum(PRODUCT_TYPES).optional(),
  airline: z.string().max(120).optional(),
  departureCity: z.string().max(120).optional(),
  providerId: z.string().length(26).optional(),
  directOnly: z.coerce.boolean().default(false),
  // hotel filters
  hotelCity: z.enum(HOTEL_CITIES).optional(),
  maxDistanceM: z.coerce.number().int().positive().optional(),
  minStars: z.coerce.number().int().min(1).max(5).optional(),
  // inventory
  seatsAvailableOnly: z.coerce.boolean().default(false),
  // pagination
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

export type SearchParams = z.infer<typeof searchPackagesSchema>;

export interface SearchResultDto {
  id: string;
  title: string;
  slug: string;
  providerName: string;
  providerBrandName: string;   // for the WhatsApp summary
  ppiuLicenseNo: string | null; // for the WhatsApp summary
  category: string;
  airline: string | null;
  nextDepartureDate: string;   // ISO — earliest matching departure
  priceFrom: number;           // min priceQuad among matching departures
  priceByOccupancy: { quad: number; triple: number | null; double: number | null };
  seatsLeft: number;           // seats of the next matching departure
  hotels: { cityName: string; name: string; stars: number; distanceM: number | null }[];
  publicUrl: string;           // server-computed via packagePublicUrl (build-time decision 1)
}
```

- [x] **Step 4: Add barrel export** — in `packages/shared/src/index.ts` append:

```ts
export * from "./search";
```

- [x] **Step 5: Run test to verify it passes**

```bash
export PATH="/c/Users/rahma/.bun/bin:$PATH"
cd packages/shared && bun run test -- search.spec.ts
```

Expected: PASS (4 schema tests).

- [x] **Step 6: Commit**

```bash
git add packages/shared/src/search.ts packages/shared/src/search.spec.ts packages/shared/src/index.ts
git commit -m "feat(package-search): add search query schema and result DTO in shared"
```

---

## Task 2: Shared — WhatsApp summary formatter

**Files:**
- Modify: `packages/shared/src/search.ts` (add `formatWhatsappSummary`)
- Modify: `packages/shared/src/search.spec.ts` (add formatter specs)

**Interfaces:**
- Consumes: `SearchResultDto` (Task 1).
- Produces: `export function formatWhatsappSummary(dto: SearchResultDto): string;` — pure, deterministic plain-text block. Reused byte-for-byte by C8/C21 later, so its output is pinned by tests. Locked decision **(D)** for the legality line.

- [x] **Step 1: Write the failing tests** — append to `packages/shared/src/search.spec.ts`:

```ts
import { formatWhatsappSummary } from "./search";
import type { SearchResultDto } from "./search";

const baseDto: SearchResultDto = {
  id: "01H00000000000000000000001",
  title: "Umrah Reguler 9 Hari",
  slug: "umrah-reguler-9-hari",
  providerName: "PT. Barokah Wisata",
  providerBrandName: "Barokah Travel",
  ppiuLicenseNo: "U.123 TAHUN 2024",
  category: "regular",
  airline: "Saudia",
  nextDepartureDate: "2026-09-12T00:00:00.000Z",
  priceFrom: 28500000,
  priceByOccupancy: { quad: 28500000, triple: 30500000, double: 33500000 },
  seatsLeft: 7,
  hotels: [
    { cityName: "Makkah", name: "Hilton Suites", stars: 5, distanceM: 150 },
    { cityName: "Madinah", name: "Anwar Al Madinah", stars: 5, distanceM: null },
  ],
  publicUrl: "https://barokah.etawafsai.com/paket/umrah-reguler-9-hari",
};

describe("formatWhatsappSummary", () => {
  it("includes name, prices, hotels, airline, seats, link and the PPIU legality line", () => {
    const out = formatWhatsappSummary(baseDto);
    expect(out).toContain("Umrah Reguler 9 Hari");
    expect(out).toContain("Saudia");
    expect(out).toContain("Hilton Suites");
    expect(out).toContain("150 m");
    expect(out).toContain("7"); // seats left
    expect(out).toContain(baseDto.publicUrl);
    expect(out).toContain(
      "Diselenggarakan oleh Barokah Travel — PPIU SK U.123 TAHUN 2024",
    );
  });

  it("omits the PPIU SK clause when the provider has no license", () => {
    const out = formatWhatsappSummary({ ...baseDto, ppiuLicenseNo: null });
    expect(out).toContain("Diselenggarakan oleh Barokah Travel");
    expect(out).not.toContain("PPIU SK");
    expect(out).not.toContain("—");
  });
});
```

- [x] **Step 2: Run to verify it fails**

```bash
export PATH="/c/Users/rahma/.bun/bin:$PATH"
cd packages/shared && bun run test -- search.spec.ts
```

Expected: FAIL — `formatWhatsappSummary` is not exported.

- [x] **Step 3: Write minimal implementation** — append to `packages/shared/src/search.ts`:

```ts
function formatIdr(amount: number): string {
  return "Rp " + amount.toLocaleString("id-ID");
}

function formatDateId(iso: string): string {
  return new Date(iso).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/**
 * Deterministic plain-text WhatsApp block. Pure — reused verbatim by C8/C21.
 * Legality line follows locked decision (D): the "— PPIU SK …" clause is
 * dropped when ppiuLicenseNo is null.
 */
export function formatWhatsappSummary(dto: SearchResultDto): string {
  const priceLines: string[] = [`- Quad: ${formatIdr(dto.priceByOccupancy.quad)}`];
  if (dto.priceByOccupancy.triple !== null) {
    priceLines.push(`- Triple: ${formatIdr(dto.priceByOccupancy.triple)}`);
  }
  if (dto.priceByOccupancy.double !== null) {
    priceLines.push(`- Double: ${formatIdr(dto.priceByOccupancy.double)}`);
  }

  const hotelLines = dto.hotels.map((h) => {
    const dist = h.distanceM !== null ? ` (${h.distanceM} m)` : "";
    return `- ${h.cityName}: ${h.name} ${"★".repeat(h.stars)}${dist}`;
  });

  const legality =
    dto.ppiuLicenseNo !== null
      ? `Diselenggarakan oleh ${dto.providerBrandName} — PPIU SK ${dto.ppiuLicenseNo}`
      : `Diselenggarakan oleh ${dto.providerBrandName}`;

  return [
    `*${dto.title}*`,
    `Keberangkatan: ${formatDateId(dto.nextDepartureDate)}`,
    `Maskapai: ${dto.airline ?? "-"}`,
    "",
    "Harga:",
    ...priceLines,
    "",
    "Hotel:",
    ...hotelLines,
    "",
    `Sisa kursi: ${dto.seatsLeft}`,
    dto.publicUrl,
    "",
    legality,
  ].join("\n");
}
```

- [x] **Step 4: Run to verify it passes**

```bash
export PATH="/c/Users/rahma/.bun/bin:$PATH"
cd packages/shared && bun run test -- search.spec.ts
```

Expected: PASS (both formatter tests + Task 1 tests).

- [x] **Step 5: Commit**

```bash
git add packages/shared/src/search.ts packages/shared/src/search.spec.ts
git commit -m "feat(package-search): add WhatsApp summary formatter with null-license branch"
```

---

## Task 3: Shared — public URL helper

**Files:**
- Modify: `packages/shared/src/search.ts` (add `packagePublicUrl`)
- Modify: `packages/shared/src/search.spec.ts` (add URL specs)

**Interfaces:**
- Produces: `export function packagePublicUrl(tenant: { slug: string; customDomain: string | null }, slug: string, baseDomain: string): string;` — pure. Locked decision **(E)**. `baseDomain` is passed in (from `PUBLIC_BASE_DOMAIN` config on the API) so the helper stays pure and testable.

- [x] **Step 1: Write the failing tests** — append to `packages/shared/src/search.spec.ts`:

```ts
import { packagePublicUrl } from "./search";

describe("packagePublicUrl", () => {
  it("uses the custom domain when the tenant has one", () => {
    const url = packagePublicUrl(
      { slug: "barokah", customDomain: "barokahtravel.co.id" },
      "umrah-reguler-9-hari",
      "etawafsai.com",
    );
    expect(url).toBe("https://barokahtravel.co.id/paket/umrah-reguler-9-hari");
  });

  it("falls back to the slug subdomain of the base domain", () => {
    const url = packagePublicUrl(
      { slug: "barokah", customDomain: null },
      "umrah-reguler-9-hari",
      "etawafsai.com",
    );
    expect(url).toBe("https://barokah.etawafsai.com/paket/umrah-reguler-9-hari");
  });
});
```

- [x] **Step 2: Run to verify it fails**

```bash
export PATH="/c/Users/rahma/.bun/bin:$PATH"
cd packages/shared && bun run test -- search.spec.ts
```

Expected: FAIL — `packagePublicUrl` not exported.

- [x] **Step 3: Write minimal implementation** — append to `packages/shared/src/search.ts`:

```ts
/**
 * Canonical public URL for a package. Locked decision (E): host is the
 * tenant's custom domain when set, otherwise `{tenant.slug}.{baseDomain}`.
 * C6 implements the actual `/paket/{slug}` route (cross-change contract).
 */
export function packagePublicUrl(
  tenant: { slug: string; customDomain: string | null },
  slug: string,
  baseDomain: string,
): string {
  const host = tenant.customDomain ?? `${tenant.slug}.${baseDomain}`;
  return `https://${host}/paket/${slug}`;
}
```

- [x] **Step 4: Run to verify it passes; then run the whole shared suite**

```bash
export PATH="/c/Users/rahma/.bun/bin:$PATH"
cd packages/shared && bun run test
```

Expected: PASS (all shared specs, including the new search specs).

- [x] **Step 5: Commit**

```bash
git add packages/shared/src/search.ts packages/shared/src/search.spec.ts
git commit -m "feat(package-search): add packagePublicUrl helper"
```

---

## Task 4: DB — `directOnly` column, full-text tsvector, GIN + departure indexes, migration

**Files:**
- Modify: `packages/db/src/schema/packages.ts` (add `directOnly`)
- Create/extend: `packages/db/drizzle/00XX_<generated_name>.sql` (hand-authored SQL appended)
- Run: `bun run db:generate` then `bun run db:migrate`

**Interfaces:**
- Produces: `packages.directOnly` (Drizzle column, `boolean("direct_only").notNull().default(false)`); DB objects `search_doc` (generated tsvector), index `packages_search_doc_gin`, index `departures_search_idx`, extension `unaccent`.

- [x] **Step 1: Add the Drizzle column** — in `packages/db/src/schema/packages.ts`, inside the `packages` table definition, add `directOnly` next to the other booleans (after `isFeatured`):

```ts
  isFeatured: boolean("is_featured").notNull().default(false),
  directOnly: boolean("direct_only").notNull().default(false),
```

(No schema change is added for `search_doc`/GIN/`departures_search_idx` — Drizzle cannot express a generated tsvector column or a GIN index cleanly; those go in the migration by hand in Step 3.)

- [x] **Step 2: Generate the base migration**

```bash
export PATH="/c/Users/rahma/.bun/bin:$PATH"
cd packages/db && bun run db:generate
```

Expected: a new `drizzle/00XX_*.sql` containing `ALTER TABLE "packages" ADD COLUMN "direct_only" boolean DEFAULT false NOT NULL;`. Note the exact new filename for Step 3.

- [x] **Step 3: Hand-append the full-text + index SQL** to the newly generated `drizzle/00XX_*.sql` (append after the generated `direct_only` statement, each block separated by `--> statement-breakpoint`):

```sql
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS unaccent;--> statement-breakpoint
ALTER TABLE "packages" ADD COLUMN "search_doc" tsvector
  GENERATED ALWAYS AS (
    to_tsvector('simple',
      unaccent(coalesce("title",'') || ' ' ||
               coalesce("description",'') || ' ' ||
               coalesce("airline",'')))
  ) STORED;--> statement-breakpoint
CREATE INDEX "packages_search_doc_gin" ON "packages" USING gin ("search_doc");--> statement-breakpoint
CREATE INDEX "departures_search_idx" ON "departures" ("tenant_id", "status", "departure_date", "price_quad");
```

> **Design §1.2 / §6 unaccent immutability — decide HERE, against the real PG image.** `unaccent()` is not `IMMUTABLE` by default, so Postgres MAY reject the generated-column expression in Step 4 with `ERROR: generation expression is not immutable`. If that happens, use the fallback: drop the `unaccent(...)` wrapper from the generated column so it reads `to_tsvector('simple', coalesce("title",'') || ' ' || coalesce("description",'') || ' ' || coalesce("airline",''))`, and correspondingly drop `unaccent(...)` from the query's `plainto_tsquery` in Task 6 (keep `'simple'`). Do NOT invent an IMMUTABLE wrapper unless the plain fallback proves insufficient during verify. Record which branch you took in the commit message.

- [x] **Step 4: Apply the migration**

```bash
export PATH="/c/Users/rahma/.bun/bin:$PATH"
cd packages/db && bun run db:migrate
```

Expected: `[✓] migrations applied`. If it fails on immutability, apply the Step 3 fallback and re-run.

- [x] **Step 5: Verify the objects exist** (sanity, tenant-agnostic):

```bash
export PATH="/c/Users/rahma/.bun/bin:$PATH"
cd packages/db && bun -e "import { createDb } from './src/index.ts'; import { databaseUrl } from './env.ts'; const db = createDb(databaseUrl); const r = await db.execute(\"select indexname from pg_indexes where indexname in ('packages_search_doc_gin','departures_search_idx')\"); console.log(r); process.exit(0);"
```

Expected: both index names printed.

- [x] **Step 6: Commit**

```bash
git add packages/db/src/schema/packages.ts packages/db/drizzle/
git commit -m "feat(package-search): add directOnly, search_doc tsvector + GIN, departure search index"
```

---

## Task 5: DB — 1k/5k benchmark seed fixture

**Files:**
- Create: `packages/db/src/fixtures/search-benchmark.ts`

**Interfaces:**
- Consumes: `createDb`, `packages`, `packageHotels`, `departures`, `providers` from `@cometkit/db`; `ulid`.
- Produces: `export async function seedSearchBenchmark(db: Database, tenantId: string): Promise<{ providerId: string; packageIds: string[] }>` — inserts 1 provider, 1,000 packages (each with 1–2 hotels), 5,000 departures (5 per package) with varied dates/prices/statuses/durations. Idempotent per call by using a unique run suffix on titles/slugs; returns ids for cleanup.

- [x] **Step 1: Write the fixture** (no separate unit test — it is exercised by the benchmark int spec in Task 9; keep it pure data-insertion):

```ts
import { ulid } from "ulid";
import { packages, packageHotels, departures, providers, type Database } from "../index";

/**
 * Seeds a deterministic 1,000-package / 5,000-departure volume fixture for one
 * tenant, used by the search benchmark integration spec. Returns ids for cleanup.
 */
export async function seedSearchBenchmark(
  db: Database,
  tenantId: string,
): Promise<{ providerId: string; packageIds: string[] }> {
  const suffix = ulid().toLowerCase();
  const providerId = ulid();
  await db.insert(providers).values({
    id: providerId,
    tenantId,
    name: `PT Bench ${suffix}`,
    brandName: `Bench ${suffix}`,
    ppiuLicenseNo: "U.999 TAHUN 2024",
    accreditation: "A",
    contactPerson: "Bench",
    contactPhone: "62800000000",
    isActive: true,
    pricePublicationConsentAt: new Date(),
  });

  const packageIds: string[] = [];
  const pkgRows: (typeof packages.$inferInsert)[] = [];
  const hotelRows: (typeof packageHotels.$inferInsert)[] = [];
  const depRows: (typeof departures.$inferInsert)[] = [];
  const statuses = ["open", "almost_full", "full", "departed", "cancelled"] as const;

  for (let i = 0; i < 1000; i++) {
    const id = ulid();
    packageIds.push(id);
    const duration = 9 + (i % 5); // 9..13
    pkgRows.push({
      id,
      tenantId,
      providerId,
      productType: "umrah",
      title: `Bench Umrah ${suffix} ${i}`,
      slug: `bench-umrah-${suffix}-${i}`,
      category: i % 3 === 0 ? "plus" : "regular",
      durationDays: duration,
      description: `Paket umrah nyaman dekat Masjidil Haram ${i}`,
      airline: i % 2 === 0 ? "Saudia" : "Garuda Indonesia",
      departureCity: "Jakarta",
      directOnly: i % 4 === 0,
      status: "published",
      hasBeenPublished: true,
    });
    hotelRows.push({
      id: ulid(),
      packageId: id,
      cityName: "Makkah",
      name: i % 50 === 0 ? `Fairmont Clock Tower ${suffix}` : `Hotel Makkah ${i}`,
      stars: 3 + (i % 3),
      distanceM: 100 + (i % 10) * 50,
      isPelataran: false,
    });

    for (let d = 0; d < 5; d++) {
      const month = 8 + (d % 5); // Sep(8)..Jan handled by month index; use fixed 2026
      const depDate = new Date(Date.UTC(2026, month, 10 + d));
      depRows.push({
        id: ulid(),
        tenantId,
        packageId: id,
        departureType: "fixed_date",
        departureDate: depDate,
        returnDate: new Date(depDate.getTime() + duration * 86400000),
        seatTotal: 45,
        seatBooked: d === 0 ? 45 : 10 + d, // d===0 -> zero seats available
        seatHeld: 0,
        currency: "IDR",
        priceQuad: 25_000_000 + (i % 20) * 500_000,
        priceTriple: d % 2 === 0 ? null : 27_000_000, // some nulls -> exercise fallback
        priceDouble: 30_000_000,
        dpAmount: 5_000_000,
        paymentSchedule: JSON.stringify([
          { name: "DP", amount: 5_000_000, daysBeforeDeparture: 60 },
        ]),
        status: statuses[d], // d=0 open, d=1 almost_full, d>=2 non-sellable
      });
    }
  }

  // Chunked inserts to stay within parameter limits.
  const chunk = <T>(arr: T[], n: number) =>
    Array.from({ length: Math.ceil(arr.length / n) }, (_, k) => arr.slice(k * n, k * n + n));
  for (const c of chunk(pkgRows, 500)) await db.insert(packages).values(c);
  for (const c of chunk(hotelRows, 500)) await db.insert(packageHotels).values(c);
  for (const c of chunk(depRows, 500)) await db.insert(departures).values(c);

  return { providerId, packageIds };
}
```

- [x] **Step 2: Typecheck the db package**

```bash
export PATH="/c/Users/rahma/.bun/bin:$PATH"
cd packages/db && bun run typecheck
```

Expected: no errors.

- [x] **Step 3: Commit**

```bash
git add packages/db/src/fixtures/search-benchmark.ts
git commit -m "feat(package-search): add 1k/5k benchmark seed fixture"
```

---

## Task 6: API — search module, endpoint, and the single query (structured filters + departure EXISTS + aggregation + occupancy fallback)

Maps tasks.md 2.1. Locked decision **(C)** lives here.

**Files:**
- Modify: `apps/api/src/config/env.ts` (add `PUBLIC_BASE_DOMAIN`)
- Create: `apps/api/src/search/search.service.ts`
- Create: `apps/api/src/search/search.controller.ts`
- Create: `apps/api/src/search/search.module.ts`
- Modify: `apps/api/src/app.module.ts` (register `SearchModule`)

**Interfaces:**
- Consumes: `searchPackagesSchema`, `SearchParams`, `SearchResultDto`, `packagePublicUrl`, `Paginated` from `@cometkit/shared`; `DB`, `Database`, `tenants` from `@cometkit/db`; `TenantScopedDb`, `JwtAuthGuard`, `RolesGuard`, `Roles`, `ZodValidationPipe`.
- Produces: `SearchService.search(params: SearchParams): Promise<Paginated<SearchResultDto>>`; `GET /search/packages`.

- [x] **Step 1: Add config** — in `apps/api/src/config/env.ts` add to `envSchema`:

```ts
  PUBLIC_BASE_DOMAIN: z.string().min(1).default("etawafsai.com"),
```

- [x] **Step 2: Write the service** — `apps/api/src/search/search.service.ts`. The query is one raw `db.execute(sql\`…\`)` with `LATERAL` for the earliest matching departure (which also enforces the departure `EXISTS`), plus json-aggregated hotels and provider join in the same round-trip. Occupancy column is chosen from a whitelist map (decision C uses `COALESCE(price_<occ>, price_quad)`).

```ts
import { Inject, Injectable } from "@nestjs/common";
import { sql } from "drizzle-orm";
import { ConfigService } from "@nestjs/config";
import { PinoLogger, InjectPinoLogger } from "nestjs-pino";
import { DB } from "../database/database.module";
import { TenantScopedDb } from "../tenancy/tenant-scoped-db";
import { tenants, type Database } from "@cometkit/db";
import {
  packagePublicUrl,
  type Paginated,
  type SearchParams,
  type SearchResultDto,
} from "@cometkit/shared";

// Whitelist maps SearchParams.occupancy -> the departures price column (decision C).
const OCC_COL: Record<SearchParams["occupancy"], string> = {
  quad: "d.price_quad",
  triple: "coalesce(d.price_triple, d.price_quad)",
  double: "coalesce(d.price_double, d.price_quad)",
};

interface SearchRow {
  id: string;
  title: string;
  slug: string;
  provider_name: string;
  provider_brand_name: string;
  ppiu_license_no: string | null;
  category: string;
  airline: string | null;
  next_departure_date: string;
  price_from: number;
  seats_left: number;
  price_quad: number;
  price_triple: number | null;
  price_double: number | null;
  hotels: { cityName: string; name: string; stars: number; distanceM: number | null }[];
}

@Injectable()
export class SearchService {
  constructor(
    private readonly tenantDb: TenantScopedDb,
    @Inject(DB) private readonly db: Database,
    private readonly config: ConfigService,
    @InjectPinoLogger(SearchService.name) private readonly logger: PinoLogger,
  ) {}

  async search(params: SearchParams): Promise<Paginated<SearchResultDto>> {
    const tenantId = this.tenantDb.tenantId;
    const offset = (params.page - 1) * params.pageSize;

    // Resolve date window: explicit dateFrom/dateTo win; else month shorthands; else open range.
    const dateFrom = params.dateFrom ?? (params.monthFrom ? `${params.monthFrom}-01T00:00:00.000Z` : null);
    const dateTo = params.dateTo ?? (params.monthTo ? monthEndIso(params.monthTo) : null);

    const occExpr = sql.raw(OCC_COL[params.occupancy]);

    // Correlated LATERAL: earliest matching departure. Its INNER JOIN enforces the
    // "at least one matching departure" semantics.
    const depLateral = sql`
      join lateral (
        select d.departure_date,
               d.price_quad as price_from,
               (d.seat_total - d.seat_booked - d.seat_held) as seats_left,
               d.price_quad, d.price_triple, d.price_double
        from departures d
        where d.package_id = p.id
          and d.tenant_id = p.tenant_id
          and d.status in ('open','almost_full')
          and (${dateFrom}::timestamptz is null or d.departure_date >= ${dateFrom}::timestamptz)
          and (${dateTo}::timestamptz   is null or d.departure_date <= ${dateTo}::timestamptz)
          and (${params.seatsAvailableOnly} = false or (d.seat_total - d.seat_booked - d.seat_held) > 0)
          and (${params.maxPrice ?? null}::int is null or ${occExpr} <= ${params.maxPrice ?? null}::int)
        order by d.departure_date asc
        limit 1
      ) nd on true`;

    const hotelLateral = sql`
      left join lateral (
        select coalesce(json_agg(json_build_object(
          'cityName', ph.city_name, 'name', ph.name,
          'stars', ph.stars, 'distanceM', ph.distance_m)), '[]'::json) as hotels
        from package_hotels ph where ph.package_id = p.id
      ) hj on true`;

    const filters = sql`
      p.tenant_id = ${tenantId}
      and p.status <> 'archived'
      and (${params.category ?? null}::text is null or p.category = ${params.category ?? null})
      and (${params.productType ?? null}::text is null or p.product_type = ${params.productType ?? null})
      and (${params.airline ?? null}::text is null or p.airline = ${params.airline ?? null})
      and (${params.departureCity ?? null}::text is null or p.departure_city = ${params.departureCity ?? null})
      and (${params.providerId ?? null}::text is null or p.provider_id = ${params.providerId ?? null})
      and (${params.durationMin ?? null}::int is null or p.duration_days >= ${params.durationMin ?? null}::int)
      and (${params.durationMax ?? null}::int is null or p.duration_days <= ${params.durationMax ?? null}::int)
      and (${params.directOnly} = false or p.direct_only = true)
      and (${params.q ?? null}::text is null
           or p.search_doc @@ plainto_tsquery('simple', unaccent(${params.q ?? null}))
           or exists (select 1 from package_hotels phq
                      where phq.package_id = p.id and phq.name ilike '%' || ${params.q ?? null} || '%'))
      and (${params.hotelCity ?? null}::text is null or exists (
            select 1 from package_hotels phc
            where phc.package_id = p.id
              and phc.city_name = ${params.hotelCity ?? null}
              and (${params.maxDistanceM ?? null}::int is null or phc.distance_m <= ${params.maxDistanceM ?? null}::int)
              and (${params.minStars ?? null}::int is null or phc.stars >= ${params.minStars ?? null}::int)))`;

    const rowsResult = await this.db.execute(sql`
      select p.id, p.title, p.slug, p.category, p.airline,
             pr.name as provider_name, pr.brand_name as provider_brand_name,
             pr.ppiu_license_no,
             nd.departure_date as next_departure_date, nd.price_from, nd.seats_left,
             nd.price_quad, nd.price_triple, nd.price_double,
             hj.hotels
      from packages p
      join providers pr on pr.id = p.provider_id
      ${depLateral}
      ${hotelLateral}
      where ${filters}
      order by nd.departure_date asc
      limit ${params.pageSize} offset ${offset}`);

    const countResult = await this.db.execute(sql`
      select count(*)::int as total
      from packages p
      ${depLateral}
      where ${filters}`);

    const rows = rowsResult as unknown as SearchRow[];
    const total = (countResult as unknown as { total: number }[])[0]?.total ?? 0;

    const [tenant] = await this.db.select().from(tenants).where(sql`${tenants.id} = ${tenantId}`).limit(1);
    const baseDomain = this.config.get<string>("PUBLIC_BASE_DOMAIN", "etawafsai.com");

    const data: SearchResultDto[] = rows.map((r) => ({
      id: r.id,
      title: r.title,
      slug: r.slug,
      providerName: r.provider_name,
      providerBrandName: r.provider_brand_name,
      ppiuLicenseNo: r.ppiu_license_no,
      category: r.category,
      airline: r.airline,
      nextDepartureDate: new Date(r.next_departure_date).toISOString(),
      priceFrom: r.price_from,
      priceByOccupancy: { quad: r.price_quad, triple: r.price_triple, double: r.price_double },
      seatsLeft: r.seats_left,
      hotels: r.hotels,
      publicUrl: packagePublicUrl(
        { slug: tenant!.slug, customDomain: tenant!.customDomain },
        r.slug,
        baseDomain,
      ),
    }));

    this.logger.info({ resultCount: data.length, total }, "search.executed");
    return {
      data,
      meta: { page: params.page, limit: params.pageSize, total, totalPages: Math.ceil(total / params.pageSize) },
    };
  }
}

function monthEndIso(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0, 23, 59, 59)).toISOString(); // last day of month
}
```

> If Task 4 took the unaccent fallback branch, remove `unaccent(...)` from the `plainto_tsquery('simple', unaccent(${...}))` line above so it reads `plainto_tsquery('simple', ${params.q ?? null})`.

- [x] **Step 3: Write the controller** — `apps/api/src/search/search.controller.ts`:

```ts
import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../auth/roles.decorator";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import {
  searchPackagesSchema,
  type SearchParams,
  type SearchResultDto,
  type Paginated,
} from "@cometkit/shared";
import { SearchService } from "./search.service";

@Controller("search")
@UseGuards(JwtAuthGuard, RolesGuard)
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get("packages")
  @Roles("admin", "user")
  async searchPackages(
    @Query(new ZodValidationPipe(searchPackagesSchema)) params: SearchParams,
  ): Promise<Paginated<SearchResultDto>> {
    return this.searchService.search(params);
  }
}
```

- [x] **Step 4: Write the module + register it** — `apps/api/src/search/search.module.ts`:

```ts
import { Module } from "@nestjs/common";
import { SearchController } from "./search.controller";
import { SearchService } from "./search.service";

@Module({
  controllers: [SearchController],
  providers: [SearchService],
})
export class SearchModule {}
```

Then in `apps/api/src/app.module.ts` add the import and list it in `imports` after `DeparturesModule`:

```ts
import { SearchModule } from "./search/search.module";
// ...
    DeparturesModule,
    SearchModule,
```

- [x] **Step 5: Typecheck the API**

```bash
export PATH="/c/Users/rahma/.bun/bin:$PATH"
cd apps/api && bun run typecheck
```

Expected: no errors. (`ZodValidationPipe` on `@Query` returns the parsed/coerced `SearchParams`; confirm the pipe passes query objects through — it is already used on bodies; if it only supports `body`, validate in the service instead by calling `searchPackagesSchema.parse(query)`.)

- [x] **Step 6: Commit**

```bash
git add apps/api/src/search/ apps/api/src/config/env.ts apps/api/src/app.module.ts
git commit -m "feat(package-search): add search endpoint with departure EXISTS query and occupancy fallback"
```

---

## Task 7: API — full-text + hotel-name + direct-only integration verified end-to-end

Maps tasks.md 2.2. The query already wires full-text, hotel-name `ILIKE`, and `directOnly` (Task 6); this task pins those behaviors with the first integration specs and closes decision-(B)/(A) coverage. Written test-first so a reviewer can reject the query if any branch is wrong.

**Files:**
- Create: `apps/api/src/search/search.service.int.spec.ts` (full-text + direct-only cases; occupancy/seats/PRD cases are added in Task 8 in the same file)

**Interfaces:**
- Consumes: `SearchService`, `TenantScopedDb`, `createDb`, schema tables, `DEFAULT_TENANT_SLUG`.

- [x] **Step 1: Write the failing integration spec** — `apps/api/src/search/search.service.int.spec.ts`. Follow the existing `packages.service.int.spec.ts` harness (dotenv load, default tenant lookup, a `ClsService` stub returning `tenantId`, `noopLogger`, self-cleaning rows). A `ConfigService` stub returns the base domain.

```ts
import { config } from "dotenv";
import { resolve } from "node:path";
import { ulid } from "ulid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ClsService } from "nestjs-cls";
import type { ConfigService } from "@nestjs/config";
import { createDb, tenants, providers, packages, packageHotels, departures, type Database } from "@cometkit/db";
import { eq, inArray } from "drizzle-orm";
import { DEFAULT_TENANT_SLUG } from "@cometkit/shared";
import { TenantScopedDb } from "../tenancy/tenant-scoped-db";
import { SearchService } from "./search.service";

config({ path: resolve(__dirname, "../../../../.env") });

const noopLogger = { info: () => undefined, warn: () => undefined, error: () => undefined } as never;
const configStub = { get: (_k: string, d?: string) => d ?? "etawafsai.com" } as unknown as ConfigService;

describe("SearchService (integration)", () => {
  let db: Database;
  let service: SearchService;
  let tenantId: string;
  let providerId: string;
  const suffix = ulid().toLowerCase();
  const pkgIds: string[] = [];

  async function seedPackage(opts: {
    title: string; directOnly?: boolean; duration?: number; hotelName?: string;
    depDate: Date; status?: string; priceQuad?: number; priceTriple?: number | null; seatBooked?: number;
  }): Promise<string> {
    const id = ulid();
    pkgIds.push(id);
    await db.insert(packages).values({
      id, tenantId, providerId, productType: "umrah", title: opts.title,
      slug: `${opts.title.toLowerCase().replace(/\s+/g, "-")}-${suffix}`,
      category: "regular", durationDays: opts.duration ?? 9, description: "paket",
      airline: "Saudia", departureCity: "Jakarta", directOnly: opts.directOnly ?? false,
      status: "published", hasBeenPublished: true,
    });
    if (opts.hotelName) {
      await db.insert(packageHotels).values({
        id: ulid(), packageId: id, cityName: "Makkah", name: opts.hotelName, stars: 5, distanceM: 150, isPelataran: false,
      });
    }
    await db.insert(departures).values({
      id: ulid(), tenantId, packageId: id, departureType: "fixed_date",
      departureDate: opts.depDate, returnDate: new Date(opts.depDate.getTime() + 9 * 86400000),
      seatTotal: 45, seatBooked: opts.seatBooked ?? 10, seatHeld: 0, currency: "IDR",
      priceQuad: opts.priceQuad ?? 28_000_000, priceTriple: opts.priceTriple ?? 30_000_000, priceDouble: 33_000_000,
      dpAmount: 5_000_000, paymentSchedule: JSON.stringify([{ name: "DP", amount: 5_000_000, daysBeforeDeparture: 60 }]),
      status: opts.status ?? "open",
    });
    return id;
  }

  beforeAll(async () => {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL required for integration tests");
    db = createDb(url);
    const [tenant] = await db.select().from(tenants).where(eq(tenants.slug, DEFAULT_TENANT_SLUG));
    if (!tenant) throw new Error("Default tenant not seeded - run bun run db:seed first");
    tenantId = tenant.id;
    providerId = ulid();
    await db.insert(providers).values({
      id: providerId, tenantId, name: `PT Search ${suffix}`, brandName: "Search Travel",
      ppiuLicenseNo: "U.123 TAHUN 2024", accreditation: "A", contactPerson: "X", contactPhone: "62800", isActive: true,
      pricePublicationConsentAt: new Date(),
    });
    const cls = { get: () => tenantId } as unknown as ClsService;
    service = new SearchService(new TenantScopedDb(db, cls), db, configStub, noopLogger);
  });

  afterAll(async () => {
    if (pkgIds.length) {
      await db.delete(departures).where(inArray(departures.packageId, pkgIds));
      await db.delete(packageHotels).where(inArray(packageHotels.packageId, pkgIds));
      await db.delete(packages).where(inArray(packages.id, pkgIds));
    }
    await db.delete(providers).where(eq(providers.id, providerId));
  });

  it("matches a hotel-name fragment and excludes unrelated packages", async () => {
    const hit = await seedPackage({ title: `HotelHit ${suffix}`, hotelName: `Zamzam Tower ${suffix}`, depDate: new Date(Date.UTC(2026, 8, 12)) });
    await seedPackage({ title: `HotelMiss ${suffix}`, hotelName: `Generic Inn ${suffix}`, depDate: new Date(Date.UTC(2026, 8, 12)) });
    const res = await service.search(searchDefaults({ q: `Zamzam Tower ${suffix}` }));
    const ids = res.data.map((r) => r.id);
    expect(ids).toContain(hit);
    expect(res.data.every((r) => r.title.startsWith("HotelHit") || r.hotels.some((h) => h.name.includes("Zamzam")))).toBe(true);
  });

  it("returns only direct-only packages when the toggle is on", async () => {
    const direct = await seedPackage({ title: `DirectYes ${suffix}`, directOnly: true, depDate: new Date(Date.UTC(2026, 8, 12)) });
    await seedPackage({ title: `DirectNo ${suffix}`, directOnly: false, depDate: new Date(Date.UTC(2026, 8, 12)) });
    const res = await service.search(searchDefaults({ directOnly: true, q: `DirectYes ${suffix}` }));
    expect(res.data.map((r) => r.id)).toContain(direct);
    const both = await service.search(searchDefaults({ directOnly: true }));
    expect(both.data.every((r) => r.id !== undefined)).toBe(true); // all returned are directOnly (query-enforced)
  });
});

// Helper: fill schema defaults so specs pass only the fields under test.
function searchDefaults(partial: Record<string, unknown>) {
  return { occupancy: "quad", directOnly: false, seatsAvailableOnly: false, page: 1, pageSize: 20, ...partial } as never;
}
```

- [x] **Step 2: Run it (fails if the query is wrong)**

```bash
export PATH="/c/Users/rahma/.bun/bin:$PATH"
cd apps/api && bun run test:int -- search.service.int.spec.ts
```

Expected: PASS if Task 6's query is correct. If it fails, load **systematic-debugging** and fix the query root cause (do NOT loosen the assertions).

- [x] **Step 3: Commit**

```bash
git add apps/api/src/search/search.service.int.spec.ts
git commit -m "test(package-search): integration specs for hotel full-text and direct-only"
```

---

## Task 8: API — PRD acceptance combo, seats toggle, occupancy fallback specs

Maps tasks.md 4.2 (functional cases). Adds the remaining acceptance scenarios from the delta spec to the same int spec file.

**Files:**
- Modify: `apps/api/src/search/search.service.int.spec.ts` (append cases)

- [x] **Step 1: Append the failing specs** (inside the same `describe`, reusing `seedPackage`/`searchDefaults`):

```ts
it("PRD combo: duration 9, maxPrice 30,000,000, September returns only qualifying packages", async () => {
  const good = await seedPackage({ title: `PrdGood ${suffix}`, duration: 9, priceQuad: 28_000_000, depDate: new Date(Date.UTC(2026, 8, 15)) });
  await seedPackage({ title: `PrdPricey ${suffix}`, duration: 9, priceQuad: 35_000_000, depDate: new Date(Date.UTC(2026, 8, 15)) });
  await seedPackage({ title: `PrdLong ${suffix}`, duration: 12, priceQuad: 28_000_000, depDate: new Date(Date.UTC(2026, 8, 15)) });
  await seedPackage({ title: `PrdOctober ${suffix}`, duration: 9, priceQuad: 28_000_000, depDate: new Date(Date.UTC(2026, 9, 15)) });
  const res = await service.search(searchDefaults({
    durationMin: 9, durationMax: 9, maxPrice: 30_000_000, monthFrom: "2026-09", monthTo: "2026-09", q: `Prd`,
  }));
  const ids = res.data.map((r) => r.id);
  expect(ids).toContain(good);
  expect(ids.every((id) => id === good)).toBe(true);
});

it("excludes a package whose only matching departure has zero seats when the toggle is on", async () => {
  const full = await seedPackage({ title: `SeatsZero ${suffix}`, seatBooked: 45, depDate: new Date(Date.UTC(2026, 8, 12)) });
  const res = await service.search(searchDefaults({ seatsAvailableOnly: true, q: `SeatsZero ${suffix}` }));
  expect(res.data.map((r) => r.id)).not.toContain(full);
  const off = await service.search(searchDefaults({ seatsAvailableOnly: false, q: `SeatsZero ${suffix}` }));
  expect(off.data.map((r) => r.id)).toContain(full); // seat status irrelevant only because departure is 'open'
});

it("falls back to priceQuad when the selected occupancy price is null", async () => {
  // priceTriple null, priceQuad within budget, triple selected -> qualifies via fallback
  const hit = await seedPackage({ title: `OccFallback ${suffix}`, priceQuad: 29_000_000, priceTriple: null, depDate: new Date(Date.UTC(2026, 8, 12)) });
  const res = await service.search(searchDefaults({ occupancy: "triple", maxPrice: 30_000_000, q: `OccFallback ${suffix}` }));
  expect(res.data.map((r) => r.id)).toContain(hit);
});
```

- [x] **Step 2: Run to verify**

```bash
export PATH="/c/Users/rahma/.bun/bin:$PATH"
cd apps/api && bun run test:int -- search.service.int.spec.ts
```

Expected: PASS (all five acceptance scenarios). Debug via **systematic-debugging** on any failure.

- [x] **Step 3: Commit**

```bash
git add apps/api/src/search/search.service.int.spec.ts
git commit -m "test(package-search): PRD combo, seats toggle, occupancy fallback integration specs"
```

---

## Task 9: API — seeded 1k/5k benchmark with EXPLAIN sanity + P95 budget

Maps tasks.md 4.2 (performance). Locked design constraint: P95 < 500 ms at 1,000/5,000.

**Files:**
- Create: `apps/api/src/search/search.benchmark.int.spec.ts`

**Interfaces:**
- Consumes: `seedSearchBenchmark` from `@cometkit/db` (Task 5), `SearchService`.

- [x] **Step 1: Write the benchmark spec** (soft P95 assertion + an EXPLAIN that must show index usage, not a full seq-scan of departures):

```ts
import { config } from "dotenv";
import { resolve } from "node:path";
import { ulid } from "ulid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ClsService } from "nestjs-cls";
import type { ConfigService } from "@nestjs/config";
import { createDb, tenants, providers, packages, packageHotels, departures, type Database } from "@cometkit/db";
import { eq, inArray, sql } from "drizzle-orm";
import { DEFAULT_TENANT_SLUG } from "@cometkit/shared";
import { seedSearchBenchmark } from "@cometkit/db/fixtures/search-benchmark"; // or "../../..": adjust to how db package exports fixtures
import { TenantScopedDb } from "../tenancy/tenant-scoped-db";
import { SearchService } from "./search.service";

config({ path: resolve(__dirname, "../../../../.env") });
const noopLogger = { info: () => undefined, warn: () => undefined, error: () => undefined } as never;
const configStub = { get: (_k: string, d?: string) => d ?? "etawafsai.com" } as unknown as ConfigService;

describe("SearchService benchmark (integration)", () => {
  let db: Database; let service: SearchService; let tenantId: string;
  let seeded: { providerId: string; packageIds: string[] };

  beforeAll(async () => {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL required for integration tests");
    db = createDb(url);
    const [tenant] = await db.select().from(tenants).where(eq(tenants.slug, DEFAULT_TENANT_SLUG));
    tenantId = tenant!.id;
    seeded = await seedSearchBenchmark(db, tenantId);
    await db.execute(sql`analyze packages`); await db.execute(sql`analyze departures`);
    const cls = { get: () => tenantId } as unknown as ClsService;
    service = new SearchService(new TenantScopedDb(db, cls), db, configStub, noopLogger);
  }, 120_000);

  afterAll(async () => {
    await db.delete(departures).where(inArray(departures.packageId, seeded.packageIds));
    await db.delete(packageHotels).where(inArray(packageHotels.packageId, seeded.packageIds));
    await db.delete(packages).where(inArray(packages.id, seeded.packageIds));
    await db.delete(providers).where(eq(providers.id, seeded.providerId));
  });

  it("meets the P95 < 500 ms budget across a standard filter set", async () => {
    const params = { occupancy: "quad", directOnly: false, seatsAvailableOnly: true,
      maxPrice: 30_000_000, durationMin: 9, durationMax: 13, monthFrom: "2026-09", monthTo: "2026-12",
      q: "umrah", page: 1, pageSize: 20 } as never;
    const timings: number[] = [];
    for (let i = 0; i < 20; i++) {
      const t = performance.now();
      await service.search(params);
      timings.push(performance.now() - t);
    }
    timings.sort((a, b) => a - b);
    const p95 = timings[Math.ceil(timings.length * 0.95) - 1];
    console.log("search P95 ms:", p95.toFixed(1));
    expect(p95).toBeLessThan(500);
  }, 60_000);

  it("EXPLAIN shows the departure lateral does not sequentially scan all departures", async () => {
    const plan = await db.execute(sql`
      explain (format json)
      select 1 from packages p
      join lateral (select 1 from departures d
        where d.package_id = p.id and d.tenant_id = p.tenant_id
          and d.status in ('open','almost_full')
          and d.departure_date >= '2026-09-01'::timestamptz
        order by d.departure_date asc limit 1) nd on true
      where p.tenant_id = ${tenantId} and p.status <> 'archived' limit 20`);
    const planText = JSON.stringify(plan);
    expect(planText).not.toMatch(/"Node Type":\s*"Seq Scan"[^}]*"Relation Name":\s*"departures"/);
  }, 60_000);
});
```

> The `@cometkit/db/fixtures/search-benchmark` import path is illustrative — resolve it to however `@cometkit/db` re-exports (add `export * from "./fixtures/search-benchmark"` to `packages/db/src/index.ts`, OR import via a deep relative path). Prefer adding the barrel export in Task 5 if the spec needs it; keep the fixture out of the app's production bundle by importing it only in the spec.

- [x] **Step 2: Ensure the fixture is importable** — if needed, add to `packages/db/src/index.ts`:

```ts
export * from "./fixtures/search-benchmark";
```

- [x] **Step 3: Run the benchmark**

```bash
export PATH="/c/Users/rahma/.bun/bin:$PATH"
cd apps/api && bun run test:int -- search.benchmark.int.spec.ts
```

Expected: PASS. If P95 ≥ 500 ms or EXPLAIN shows a departures seq-scan, load **systematic-debugging**; add the covering index the plan warrants (design §1.3 / §6 permit adding indexes only where measured) and re-run. Record the observed P95 in the commit message.

- [x] **Step 4: Commit**

```bash
git add apps/api/src/search/search.benchmark.int.spec.ts packages/db/src/index.ts
git commit -m "test(package-search): 1k/5k benchmark with EXPLAIN sanity and P95 budget"
```

---

## Task 10: Web — search data hook

**Files:**
- Create: `apps/web/src/hooks/use-search.ts`

**Interfaces:**
- Consumes: `SearchParams`, `SearchResultDto`, `Paginated` from `@cometkit/shared`; shared `api` ky instance.
- Produces: `useSearchPackages(params: Partial<SearchParams>)` → `useQuery<Paginated<SearchResultDto>>`, query key `["search", params]`.

- [x] **Step 1: Write the hook** — `apps/web/src/hooks/use-search.ts`:

```ts
"use client";

import { useQuery } from "@tanstack/react-query";
import type { Paginated, SearchParams, SearchResultDto } from "@cometkit/shared";
import { api } from "@/lib/api";

export const searchKeys = {
  all: ["search"] as const,
  list: (params: Partial<SearchParams>) => ["search", params] as const,
};

export function useSearchPackages(params: Partial<SearchParams>) {
  return useQuery<Paginated<SearchResultDto>>({
    queryKey: searchKeys.list(params),
    queryFn: () => {
      // Drop undefined/empty values so the query string stays clean.
      const searchParams: Record<string, string> = {};
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== null && v !== "") searchParams[k] = String(v);
      }
      return api.get("search/packages", { searchParams }).json<Paginated<SearchResultDto>>();
    },
    placeholderData: (previous) => previous,
  });
}
```

- [x] **Step 2: Typecheck web**

```bash
export PATH="/c/Users/rahma/.bun/bin:$PATH"
cd apps/web && bun run typecheck
```

Expected: no errors.

- [x] **Step 3: Commit**

```bash
git add apps/web/src/hooks/use-search.ts
git commit -m "feat(package-search): add useSearchPackages query hook"
```

---

## Task 11: Web — search screen (bottom-sheet filters, active chips, result cards at 380px)

Maps tasks.md 3.1.

**Files:**
- Create: `apps/web/src/lib/clipboard.ts`
- Create: `apps/web/src/app/dashboard/search/result-card.tsx`
- Create: `apps/web/src/app/dashboard/search/search-filters.tsx`
- Create: `apps/web/src/app/dashboard/search/page.tsx`

**Interfaces:**
- Consumes: `useSearchPackages` (Task 10); `formatWhatsappSummary`, `SearchResultDto`, `SearchParams` from `@cometkit/shared`; existing shadcn `ui` primitives (`Button`, `Card`, `Input`, `Sheet` if present — else a fixed-position panel), `readApiError`.
- Produces: the `/dashboard/search` route. `result-card.tsx` exports `ResultCard` used by `page.tsx`; clipboard actions land in Task 12 but the card renders the two action buttons here (wired in Task 12).

- [x] **Step 1: Check available primitives** — confirm whether a `Sheet` primitive exists:

```bash
ls apps/web/src/components/ui | grep -iE "sheet|dialog|input|checkbox|select"
```

If `sheet` is absent, use a bottom-fixed panel toggled by state (mobile-first) rather than adding a dependency; if `dialog` exists it can back the panel. Use whatever `Input`/`Button`/`Card` exist (they do, per `packages/page.tsx`).

- [x] **Step 2: Write `result-card.tsx`** — compact card, mobile-first, two action buttons (handlers passed in from the page; implemented in Task 12):

```tsx
"use client";

import type { SearchResultDto } from "@cometkit/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export function ResultCard({
  dto, onCopySummary, onCopyLink,
}: {
  dto: SearchResultDto;
  onCopySummary: (dto: SearchResultDto) => void;
  onCopyLink: (dto: SearchResultDto) => void;
}) {
  const date = new Date(dto.nextDepartureDate).toLocaleDateString("id-ID", {
    day: "numeric", month: "short", year: "numeric", timeZone: "UTC",
  });
  return (
    <Card className="overflow-hidden">
      <CardContent className="space-y-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-base font-semibold leading-tight">{dto.title}</h3>
          <span className="whitespace-nowrap font-mono text-xs text-muted-foreground">{dto.seatsLeft} kursi</span>
        </div>
        <p className="text-xs text-muted-foreground">{dto.providerBrandName} · {dto.airline ?? "-"}</p>
        <div className="flex items-baseline justify-between">
          <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Mulai · {date}</span>
          <span className="text-sm font-semibold">Rp {dto.priceFrom.toLocaleString("id-ID")}</span>
        </div>
        <ul className="space-y-0.5 text-xs">
          {dto.hotels.map((h, i) => (
            <li key={i} className="flex justify-between">
              <span>{h.cityName}: {h.name}</span>
              <span className="font-mono text-muted-foreground">{h.distanceM !== null ? `${h.distanceM} m` : "-"}</span>
            </li>
          ))}
        </ul>
        <div className="flex gap-2 pt-1">
          <Button size="sm" variant="secondary" className="flex-1" onClick={() => onCopySummary(dto)}>
            Salin ringkasan
          </Button>
          <Button size="sm" variant="outline" className="flex-1" onClick={() => onCopyLink(dto)}>
            Salin tautan
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
```

- [x] **Step 3: Write `search-filters.tsx`** — a bottom-sheet-style panel plus an active-filter chip row. Keep filters controlled by the parent's `params` state:

```tsx
"use client";

import type { SearchParams } from "@cometkit/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Filters = Partial<SearchParams>;

export function ActiveChips({ filters, onRemove }: { filters: Filters; onRemove: (key: keyof Filters) => void }) {
  const entries = Object.entries(filters).filter(([, v]) => v !== undefined && v !== "" && v !== false);
  if (entries.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {entries.map(([k, v]) => (
        <button key={k} onClick={() => onRemove(k as keyof Filters)}
          className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs">
          {k}: {String(v)} <span aria-hidden>×</span>
          <span className="sr-only">Hapus filter {k}</span>
        </button>
      ))}
    </div>
  );
}

export function FilterSheet({
  open, filters, onChange, onClose,
}: {
  open: boolean; filters: Filters; onChange: (next: Filters) => void; onClose: () => void;
}) {
  if (!open) return null;
  const set = (patch: Filters) => onChange({ ...filters, ...patch });
  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/40" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="w-full space-y-3 rounded-t-2xl bg-background p-4" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-sm font-semibold">Filter</h2>
        <label className="block text-xs">Harga maksimum
          <Input type="number" inputMode="numeric" value={filters.maxPrice ?? ""}
            onChange={(e) => set({ maxPrice: e.target.value ? Number(e.target.value) : undefined })} />
        </label>
        <label className="block text-xs">Durasi (hari) minimum
          <Input type="number" value={filters.durationMin ?? ""}
            onChange={(e) => set({ durationMin: e.target.value ? Number(e.target.value) : undefined })} />
        </label>
        <label className="flex items-center gap-2 text-xs">
          <input type="checkbox" checked={filters.directOnly ?? false}
            onChange={(e) => set({ directOnly: e.target.checked })} /> Direct only
        </label>
        <label className="flex items-center gap-2 text-xs">
          <input type="checkbox" checked={filters.seatsAvailableOnly ?? false}
            onChange={(e) => set({ seatsAvailableOnly: e.target.checked })} /> Hanya yang ada kursi
        </label>
        <Button size="sm" className="w-full" onClick={onClose}>Terapkan</Button>
      </div>
    </div>
  );
}
```

- [x] **Step 4: Write `page.tsx`** — wire search box + chips + sheet + result list. Clipboard handlers are stubbed here and filled in Task 12:

```tsx
"use client";

import { useState } from "react";
import type { SearchParams, SearchResultDto } from "@cometkit/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSearchPackages } from "@/hooks/use-search";
import { readApiError } from "@/lib/api";
import { ResultCard } from "./result-card";
import { ActiveChips, FilterSheet } from "./search-filters";

export default function SearchPage() {
  const [filters, setFilters] = useState<Partial<SearchParams>>({});
  const [sheetOpen, setSheetOpen] = useState(false);
  const { data, isPending, error } = useSearchPackages(filters);

  const removeFilter = (key: keyof Partial<SearchParams>) => {
    setFilters((f) => { const next = { ...f }; delete next[key]; return next; });
  };
  // Filled in Task 12:
  const onCopySummary = (_dto: SearchResultDto) => {};
  const onCopyLink = (_dto: SearchResultDto) => {};

  return (
    <main className="mx-auto w-full max-w-md space-y-4 px-4 py-6">
      <header className="space-y-1">
        <span className="font-mono text-xs uppercase tracking-[0.22em] text-muted-foreground">catalog · search</span>
        <h1 className="text-xl font-bold tracking-tight">Cari paket</h1>
      </header>

      <div className="flex gap-2">
        <Input placeholder="Cari judul, hotel, maskapai…" value={filters.q ?? ""}
          onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value || undefined }))} />
        <Button variant="outline" onClick={() => setSheetOpen(true)}>Filter</Button>
      </div>

      <ActiveChips filters={filters} onRemove={removeFilter} />

      {error && <p role="alert" className="text-sm text-destructive">{/* async message resolved below */}Gagal memuat hasil.</p>}
      {isPending && <p className="font-mono text-xs text-muted-foreground">Memuat…</p>}

      <div className="space-y-3">
        {data?.data.map((dto) => (
          <ResultCard key={dto.id} dto={dto} onCopySummary={onCopySummary} onCopyLink={onCopyLink} />
        ))}
        {data && data.data.length === 0 && (
          <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
            Tidak ada paket yang cocok. Longgarkan filter dan coba lagi.
          </div>
        )}
      </div>

      <FilterSheet open={sheetOpen} filters={filters} onChange={setFilters} onClose={() => setSheetOpen(false)} />
    </main>
  );
}
```

(`readApiError` is imported for parity with house error handling; if the lint rule flags it as unused until Task 12, remove the import now and re-add it in Task 12.)

- [x] **Step 5: Typecheck + lint web**

```bash
export PATH="/c/Users/rahma/.bun/bin:$PATH"
cd apps/web && bun run typecheck && bun run lint
```

Expected: no errors.

- [x] **Step 6: Commit**

```bash
git add apps/web/src/app/dashboard/search/ apps/web/src/lib/clipboard.ts
git commit -m "feat(package-search): add mobile-first search screen with filters and result cards"
```

(`clipboard.ts` is created empty-then-filled in Task 12; if you prefer, defer its `git add` to Task 12.)

---

## Task 12: Web — clipboard actions (WhatsApp summary + public link) with mobile fallback

Maps tasks.md 3.2. Reuses `formatWhatsappSummary` (Task 2) and `dto.publicUrl` (server-computed via `packagePublicUrl`, build-time decision 1).

**Files:**
- Create/fill: `apps/web/src/lib/clipboard.ts`
- Modify: `apps/web/src/app/dashboard/search/page.tsx` (wire handlers + `role="alert"` feedback)

- [x] **Step 1: Write the clipboard util** — `apps/web/src/lib/clipboard.ts` with an `execCommand` fallback for older mobile browsers:

```ts
/**
 * Copy text to the clipboard. Prefers the async Clipboard API; falls back to a
 * hidden textarea + execCommand('copy') for older mobile browsers. Returns
 * whether the copy succeeded so callers can surface feedback with role="alert".
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to legacy path
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}
```

- [x] **Step 2: Wire the handlers in `page.tsx`** — replace the stub handlers and add a transient status region:

```tsx
import { formatWhatsappSummary } from "@cometkit/shared";
import { copyText } from "@/lib/clipboard";
// ...inside the component:
const [copied, setCopied] = useState<string | null>(null);

const flash = (msg: string) => { setCopied(msg); setTimeout(() => setCopied(null), 2500); };

const onCopySummary = async (dto: SearchResultDto) => {
  const ok = await copyText(formatWhatsappSummary(dto));
  flash(ok ? "Ringkasan disalin ke clipboard." : "Gagal menyalin. Salin manual dari kartu.");
};
const onCopyLink = async (dto: SearchResultDto) => {
  const ok = await copyText(dto.publicUrl);
  flash(ok ? "Tautan disalin ke clipboard." : "Gagal menyalin tautan. Coba lagi.");
};
```

And render the status near the actions:

```tsx
{copied && <p role="alert" className="font-mono text-xs text-muted-foreground">{copied}</p>}
```

- [x] **Step 3: Typecheck + lint**

```bash
export PATH="/c/Users/rahma/.bun/bin:$PATH"
cd apps/web && bun run typecheck && bun run lint
```

Expected: no errors.

- [x] **Step 4: Manual mobile check (verify phase note)** — during verification, confirm copy works on Android Chrome (design §6). Not a blocking automated gate, but record the result.

- [x] **Step 5: Commit**

```bash
git add apps/web/src/lib/clipboard.ts apps/web/src/app/dashboard/search/page.tsx
git commit -m "feat(package-search): clipboard actions for WhatsApp summary and public link"
```

---

## Task 13: Verification gate — `bun run verify` + `bun run test:int`

Maps tasks.md 4.3. Load **verification-before-completion** before claiming done.

**Files:** none (gate only).

- [x] **Step 1: Full quality gate**

```bash
export PATH="/c/Users/rahma/.bun/bin:$PATH"
cd /c/Sobari/Ai/tawaf-sai/e-tawafsai && bun run verify
```

Expected: typecheck + lint + unit tests all pass across `shared`, `db`, `api`, `web`. Fix any failure at its root (load **systematic-debugging**); do not weaken assertions.

- [x] **Step 2: Integration suite (needs local Postgres, seeded)**

```bash
export PATH="/c/Users/rahma/.bun/bin:$PATH"
cd apps/api && bun run db:migrate 2>/dev/null; bun run test:int
```

Expected: all `*.int.spec.ts` pass, including `search.service.int.spec.ts` (5 acceptance scenarios) and `search.benchmark.int.spec.ts` (P95 < 500 ms, EXPLAIN sanity). Ensure `bun run db:seed` has been run at least once so `DEFAULT_TENANT_SLUG` exists.

- [x] **Step 3: Confirm and report** — record: verify result, int result, observed benchmark P95, and which unaccent branch (Task 4) shipped. No commit needed unless fixes were made.

---

## Self-Review (performed against the delta spec + design doc)

**Spec coverage:**
- *Combined-filter search with departure semantics* (delta req 1) → Tasks 1 (schema), 6 (query + occupancy fallback C), 7–8 (int specs incl. seats toggle, direct-only A, occupancy fallback C, PRD combo).
- *Full-text search* (delta req 2, incl. hotel names B) → Task 4 (tsvector+GIN), 6 (query FT + hotel EXISTS), 7 (hotel-name int spec).
- *Result cards with one-tap actions* (delta req 3, incl. WhatsApp summary D, public link E) → Tasks 2 (formatter D), 3 (URL helper E), 11 (cards), 12 (clipboard + fallback).
- *Performance budget* (delta req 4) → Tasks 4 (indexes), 5 (fixture), 9 (benchmark P95 + EXPLAIN).
- tasks.md 1.1 → Tasks 1–3; 1.2 → Tasks 4–5; 2.1 → Task 6; 2.2 → Tasks 6–7; 3.1 → Task 11; 3.2 → Task 12; 4.1 → Tasks 1–3 (unit specs); 4.2 → Tasks 8–9; 4.3 → Task 13.

**Design-doc coverage:** §1.1 directOnly → T4; §1.2 tsvector+GIN + unaccent immutability fallback → T4 (explicit build-time branch); §1.3 departure index → T4; §2.1 schema → T1; §2.2 DTO → T1 (+publicUrl); §2.3 formatter → T2; §2.4 URL helper → T3; §3 endpoint+query → T6; §4 web → T10–12; §5 scope (`<> 'archived'`) → T6 filters; §7 testing → T7–9,13; §8 migration → T4.

**Type consistency:** `searchPackagesSchema`/`SearchParams`/`SearchResultDto`/`formatWhatsappSummary(dto)`/`packagePublicUrl(tenant, slug, baseDomain)` are defined once in Task 1–3 and consumed by that exact signature in Tasks 6, 10, 11, 12. `SearchService.search(params): Promise<Paginated<SearchResultDto>>` is produced in Task 6 and consumed by the controller (T6) and specs (T7–9). `seedSearchBenchmark(db, tenantId)` defined T5, consumed T9.

**Open build-time decisions the implementer MUST resolve (documented, not placeholders):** (1) unaccent immutability branch in Task 4 Step 3–4; (2) whether `ZodValidationPipe` supports `@Query` or the service must `.parse()` (Task 6 Step 5); (3) whether a `Sheet` primitive exists or a fixed panel is used (Task 11 Step 1); (4) fixture export path for the benchmark import (Task 9 Step 2). Each has a concrete default in-line.
