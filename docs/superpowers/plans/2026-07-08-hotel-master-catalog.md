---
change: hotel-master-catalog
design-doc: docs/superpowers/specs/2026-07-08-hotel-master-catalog-design.md
base-ref: ebfcc2d0b46aff54056a7a9aa7df3d3670a25f72
archived-with: 2026-07-08-hotel-master-catalog
---

# Hotel Master Catalog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (or subagent-driven-development) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. This repo requires **manual gating**: stop after each task, tick it in `openspec/changes/hotel-master-catalog/tasks.md`, commit, and ask before the next.

**Goal:** Replace per-package free-text hotels with an admin-managed hotel catalog that packages reference by `hotelId`.

**Architecture:** New tenant-global `hotels` table owns all hotel attributes; `package_hotels` becomes a pure link `{ packageId, hotelId }`. A new `HotelsModule` (mirroring `airlines`) provides admin CRUD; the package form picks catalog hotels per city and attaches/detaches by id. DTO keeps `cityName` (mapped from `hotels.city`) so publish policy and search are untouched at the contract level.

**Tech Stack:** Nest 11 + Drizzle (Postgres), Zod 4, TypeScript 6, TanStack Query, Next.js (App Router), Vitest, bun.

## Global Constraints

- Wire shapes (Zod request schemas + response interfaces) live in `packages/shared`; columns in `packages/db`; dependency direction `shared ← db ← api`, `shared ← web` — never reversed.
- Zod 4 idioms (`z.string()`, `.optional()`); import as `import * as z from "zod"` in files run under vitest.
- Nest: throw `HttpException` subclasses; never try/catch to shape errors in controllers. Protect mutations with `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles("admin")`. Structured logging `this.logger.info({ ... }, "noun.verb")`.
- Destructive web actions gate behind `useConfirm()` — never a bare mutation, never `window.confirm`.
- `bun run verify` (typecheck + lint + test) is the gate; `bun run test:int` needs local Postgres. Always `db:migrate` before `db:seed`. Run `.ts` scripts with `bun file.ts`. Export bun PATH in bash: `export PATH="/c/Users/rahma/.bun/bin:$PATH"`.
- New runtime imports must be declared in that package's `package.json` (bun isolated linker does not hoist) — not needed here (all imports already present).

archived-with: 2026-07-08-hotel-master-catalog
---

### Task 1: Shared hotel contracts

**Files:**
- Create: `packages/shared/src/hotels.ts`
- Modify: `packages/shared/src/index.ts` (add `export * from "./hotels";`)
- Modify: `packages/shared/src/packages.ts` (change `HotelInput`, add `PackageHotelDto`, retype `PackageDto.hotels`)
- Test: `packages/shared/src/hotels.spec.ts`

**Interfaces:**
- Produces: `createHotelSchema`, `updateHotelSchema`, `CreateHotelInput`, `UpdateHotelInput`, `HotelDto`, `PackageHotelDto`; `HotelInput = { hotelId: string }`.

- [x] **Step 1: Write the failing test** — `packages/shared/src/hotels.spec.ts`

```ts
import { describe, it, expect } from "vitest";
import { createHotelSchema, updateHotelSchema } from "./hotels";

describe("hotels schema", () => {
  it("accepts a full valid hotel", () => {
    const parsed = createHotelSchema.parse({
      name: "Hilton Suites", city: "Makkah", stars: 5, distanceM: 150, isPelataran: true,
    });
    expect(parsed.name).toBe("Hilton Suites");
    expect(parsed.isActive).toBe(true); // defaulted
  });

  it("rejects stars out of range and empty name", () => {
    expect(() => createHotelSchema.parse({ name: "X", city: "Makkah", stars: 9 })).toThrow();
    expect(() => createHotelSchema.parse({ name: "", city: "Makkah", stars: 5 })).toThrow();
  });

  it("update schema makes everything optional", () => {
    expect(updateHotelSchema.parse({ stars: 4 })).toEqual({ stars: 4 });
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `cd packages/shared && bun run test -- hotels.spec` (or `bunx vitest run src/hotels.spec.ts`)
Expected: FAIL — cannot find module `./hotels`.

- [x] **Step 3: Create `packages/shared/src/hotels.ts`**

```ts
import * as z from "zod";

export const createHotelSchema = z.object({
  name: z.string().min(1).max(120),
  city: z.string().min(1).max(120),
  stars: z.number().int().min(1).max(5).default(3),
  distanceM: z.number().int().nonnegative().nullable().optional(),
  isPelataran: z.boolean().default(false),
  isActive: z.boolean().default(true),
});

export const updateHotelSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  city: z.string().min(1).max(120).optional(),
  stars: z.number().int().min(1).max(5).optional(),
  distanceM: z.number().int().nonnegative().nullable().optional(),
  isPelataran: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

export type CreateHotelInput = z.input<typeof createHotelSchema>;
export type UpdateHotelInput = z.input<typeof updateHotelSchema>;

export interface HotelDto {
  id: string;
  tenantId: string;
  name: string;
  city: string;
  stars: number;
  distanceM: number | null;
  isPelataran: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}
```

- [x] **Step 4: Wire exports and package DTO** — add to `packages/shared/src/index.ts` after the `master-data` export:

```ts
export * from "./hotels";
```

In `packages/shared/src/packages.ts`, replace the `HotelInput` interface and retype `PackageDto.hotels`:

```ts
// attach input: reference a catalog hotel by id
export interface HotelInput {
  hotelId: string;
}

// a hotel as it appears on a package (catalog attributes + link id)
export interface PackageHotelDto {
  hotelId: string;
  cityName: string;
  name: string;
  stars: number;
  distanceM: number | null;
  isPelataran: boolean;
}
```

And change the `PackageDto.hotels` field type from `hotels: HotelInput[];` to:

```ts
  hotels: PackageHotelDto[];
```

- [x] **Step 5: Run tests to verify they pass**

Run: `cd packages/shared && bunx vitest run src/hotels.spec.ts`
Expected: PASS (3 tests).

- [x] **Step 6: Commit**

```bash
git add packages/shared/src/hotels.ts packages/shared/src/hotels.spec.ts packages/shared/src/index.ts packages/shared/src/packages.ts
git commit -m "feat(shared): hotel catalog schemas + package hotel DTO (hotel-master-catalog 1.1-1.3)"
```

archived-with: 2026-07-08-hotel-master-catalog
---

### Task 2: DB schema — hotels table + package_hotels reshape

**Files:**
- Modify: `packages/db/src/schema/packages.ts` (add `hotels`, reshape `packageHotels`, add types)

**Interfaces:**
- Produces: `hotels` table, reshaped `packageHotels`, `DbHotel`/`NewDbHotel`, reshaped `DbPackageHotel`/`NewDbPackageHotel`.

- [x] **Step 1: Add the `hotels` table** in `packages/db/src/schema/packages.ts` (place next to the other master tables, after `departureCities`). It needs `tenantOwned`, `uniqueIndex`, `sql` — all already imported.

```ts
export const hotels = pgTable("hotels", {
  id: ulidPk(),
  ...tenantOwned(),
  name: varchar("name", { length: 120 }).notNull(),
  city: varchar("city", { length: 120 }).notNull(),
  stars: integer("stars").notNull().default(3),
  distanceM: integer("distance_m"),
  isPelataran: boolean("is_pelataran").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  ...timestamps,
}, (t) => [
  uniqueIndex("hotels_tenant_name_city_idx")
    .on(t.tenantId, sql`lower(btrim(${t.name}))`, sql`lower(btrim(${t.city}))`),
]);

export type DbHotel = typeof hotels.$inferSelect;
export type NewDbHotel = typeof hotels.$inferInsert;
```

- [x] **Step 2: Reshape `packageHotels`** — replace the whole existing `packageHotels` definition (the block with `cityName/name/stars/distanceM/isPelataran`) with the link table:

```ts
export const packageHotels = pgTable("package_hotels", {
  id: ulidPk(),
  packageId: ulidRef("package_id")
    .notNull()
    .references(() => packages.id, { onDelete: "cascade" }),
  hotelId: ulidRef("hotel_id")
    .notNull()
    .references(() => hotels.id),
  ...timestamps,
}, (table) => [
  index("package_hotels_package_id_idx").on(table.packageId),
  index("package_hotels_hotel_id_idx").on(table.hotelId),
  unique("package_hotels_package_hotel_idx").on(table.packageId, table.hotelId),
]);
```

The `DbPackageHotel`/`NewDbPackageHotel` type exports at the bottom of the file stay as-is (they infer from the new shape automatically).

- [x] **Step 3: Typecheck the db package**

Run: `cd packages/db && bunx tsc --noEmit`
Expected: PASS (schema compiles; `hotels` referenced before-or-after `packageHotels` is fine — Drizzle refs are lazy `() => hotels.id`).

- [x] **Step 4: Commit**

```bash
git add packages/db/src/schema/packages.ts
git commit -m "feat(db): hotels catalog table + package_hotels as a link (hotel-master-catalog 2.1-2.2)"
```

archived-with: 2026-07-08-hotel-master-catalog
---

### Task 3: Migration + demo seed

**Files:**
- Create: `packages/db/drizzle/<generated>.sql` (via `db:generate`, then hand-edit)
- Modify: `packages/db/src/seed.ts` (starter hotels + demo package↔hotel links)

- [x] **Step 1: Generate the migration**

Run: `bun run db:generate`
This creates a new SQL migration for the `hotels` table, the dropped `package_hotels` columns, and the new `hotel_id` FK + indexes.

- [x] **Step 2: Hand-verify / fix the generated SQL** — open the new file under `packages/db/drizzle/`. It MUST clear `package_hotels` BEFORE adding `hotel_id NOT NULL`, or the NOT NULL add fails on existing rows. Ensure the statement order is:

```sql
CREATE TABLE "hotels" ( ... );
--> statement-breakpoint
DELETE FROM "package_hotels";            -- fresh start, no backfill (ADD THIS if absent)
--> statement-breakpoint
ALTER TABLE "package_hotels" DROP COLUMN "city_name";
ALTER TABLE "package_hotels" DROP COLUMN "name";
ALTER TABLE "package_hotels" DROP COLUMN "stars";
ALTER TABLE "package_hotels" DROP COLUMN "distance_m";
ALTER TABLE "package_hotels" DROP COLUMN "is_pelataran";
--> statement-breakpoint
ALTER TABLE "package_hotels" ADD COLUMN "hotel_id" char(26) NOT NULL;
ALTER TABLE "package_hotels" ADD CONSTRAINT "package_hotels_hotel_id_hotels_id_fk"
  FOREIGN KEY ("hotel_id") REFERENCES "hotels"("id");
-- plus the created_at/updated_at columns, hotels unique index,
-- package_hotels_hotel_id_idx, and package_hotels_package_hotel_idx unique
```

If drizzle omits the `DELETE FROM "package_hotels";`, add it manually before the `ADD COLUMN ... NOT NULL`. (drizzle-kit does not know rows must be cleared.)

- [x] **Step 3: Apply the migration**

Run: `bun run db:migrate`
Expected: applies cleanly, no NOT NULL violation.

- [x] **Step 4: Seed starter hotels + link them to the demo package** — in `packages/db/src/seed.ts`, inside the demo-tenant block, AFTER the `demoAirline`/`demoCity` lookups and AFTER the `packages.insert(...).onConflictDoNothing()` that creates `packageId`, add:

```ts
// Starter hotel catalog for the demo tenant only.
const STARTER_HOTELS: {
  name: string; city: string; stars: number; distanceM: number | null; isPelataran: boolean;
}[] = [
  { name: "Swissotel Al Maqam", city: "Makkah", stars: 5, distanceM: 50, isPelataran: true },
  { name: "Hilton Makkah Convention", city: "Makkah", stars: 5, distanceM: 250, isPelataran: false },
  { name: "Anwar Al Madinah Movenpick", city: "Madinah", stars: 5, distanceM: 100, isPelataran: false },
];
for (const h of STARTER_HOTELS) {
  await db.insert(schema.hotels)
    .values({ id: ulid(), tenantId: tenant.id, ...h, isActive: true })
    .onConflictDoNothing();
}
// Link a Makkah + a Madinah hotel to the demo package so it stays publishable.
const linkHotels = await db
  .select({ id: schema.hotels.id })
  .from(schema.hotels)
  .where(and(
    eq(schema.hotels.tenantId, tenant.id),
    inArray(schema.hotels.name, ["Swissotel Al Maqam", "Anwar Al Madinah Movenpick"]),
  ));
for (const h of linkHotels) {
  await db.insert(schema.packageHotels)
    .values({ id: ulid(), packageId, hotelId: h.id })
    .onConflictDoNothing();
}
```

Ensure `inArray` is imported in `seed.ts` (add to the existing `drizzle-orm` import if missing: it currently imports `{ and, eq }`).

- [x] **Step 5: Run the seed and verify**

Run: `bun run db:seed`
Then verify: `bun run --cwd packages/db exec psql "$DATABASE_URL" -c "select p.title, h.name, h.city from package_hotels ph join packages p on p.id=ph.package_id join hotels h on h.id=ph.hotel_id;"` (or a quick drizzle query) — expect the demo package linked to a Makkah + Madinah hotel.

- [x] **Step 6: Commit**

```bash
git add packages/db/drizzle packages/db/src/seed.ts
git commit -m "feat(db): migration + demo seed for hotel catalog (hotel-master-catalog 2.3-2.4)"
```

archived-with: 2026-07-08-hotel-master-catalog
---

### Task 4: API — HotelsModule (catalog CRUD)

**Files:** (all under `apps/api/src/hotels/`, mirroring `apps/api/src/airlines/`)
- Create: `hotels.policy.ts`, `hotels.service.ts`, `hotels.controller.ts`, `hotels.module.ts`
- Create: `hotels.policy.spec.ts`, `hotels.service.int.spec.ts`
- Modify: `apps/api/src/app.module.ts` (register `HotelsModule`)

**Interfaces:**
- Consumes: `hotels`, `packages`, `DbHotel`, `Database` from `@cometkit/db`; `TenantScopedDb`; `HotelDto`, `CreateHotelInput`, `UpdateHotelInput`.
- Produces: `HotelsService` (`list`, `findById`, `create`, `update`, `remove`), `toHotelDto`, `normalizeHotelName`.

- [x] **Step 1: Write the failing policy test** — `apps/api/src/hotels/hotels.policy.spec.ts`

```ts
import { describe, it, expect } from "vitest";
import { normalizeHotelName, toHotelDto } from "./hotels.policy";

describe("hotels.policy", () => {
  it("normalizes name (trim + lowercase)", () => {
    expect(normalizeHotelName("  Hilton Suites ")).toBe("hilton suites");
  });

  it("maps a row to a dto with ISO timestamps", () => {
    const now = new Date("2026-07-08T00:00:00Z");
    const dto = toHotelDto({
      id: "h1", tenantId: "t1", name: "Hilton", city: "Makkah", stars: 5,
      distanceM: 150, isPelataran: true, isActive: true, createdAt: now, updatedAt: now,
    });
    expect(dto).toEqual({
      id: "h1", tenantId: "t1", name: "Hilton", city: "Makkah", stars: 5,
      distanceM: 150, isPelataran: true, isActive: true,
      createdAt: now.toISOString(), updatedAt: now.toISOString(),
    });
  });
});
```

- [x] **Step 2: Run it to verify it fails**

Run: `cd apps/api && bunx vitest run src/hotels/hotels.policy.spec.ts`
Expected: FAIL — cannot find `./hotels.policy`.

- [x] **Step 3: Create `hotels.policy.ts`**

```ts
import type { DbHotel } from "@cometkit/db";
import type { HotelDto } from "@cometkit/shared";

export function normalizeHotelName(name: string): string {
  return name.trim().toLowerCase();
}

export function toHotelDto(row: DbHotel): HotelDto {
  return {
    id: row.id,
    tenantId: row.tenantId,
    name: row.name,
    city: row.city,
    stars: row.stars,
    distanceM: row.distanceM,
    isPelataran: row.isPelataran,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
```

- [x] **Step 4: Run policy test to verify it passes**

Run: `cd apps/api && bunx vitest run src/hotels/hotels.policy.spec.ts`
Expected: PASS (2 tests).

- [x] **Step 5: Create `hotels.service.ts`** (mirror `airlines.service.ts`; uniqueness on name+city).

```ts
import { Inject, Injectable, ConflictException, NotFoundException } from "@nestjs/common";
import { InjectPinoLogger, PinoLogger } from "nestjs-pino";
import { and, eq, ne, sql, type SQL } from "drizzle-orm";
import { ulid } from "ulid";
import { hotels, packageHotels, type DbHotel, type Database } from "@cometkit/db";
import type { CreateHotelInput, UpdateHotelInput } from "@cometkit/shared";
import { TenantScopedDb } from "../tenancy/tenant-scoped-db";
import { DB } from "../database/database.module";
import { normalizeHotelName } from "./hotels.policy";

@Injectable()
export class HotelsService {
  constructor(
    private readonly tenantDb: TenantScopedDb,
    @Inject(DB) private readonly db: Database,
    @InjectPinoLogger(HotelsService.name) private readonly logger: PinoLogger,
  ) {}

  async list(): Promise<DbHotel[]> {
    return (await this.tenantDb.select(hotels)) as DbHotel[];
  }

  async findById(id: string): Promise<DbHotel | undefined> {
    const [row] = await this.tenantDb.select(hotels, eq(hotels.id, id));
    return row as DbHotel | undefined;
  }

  private async assertNoConflict(name: string, city: string, excludeId?: string): Promise<void> {
    const match = and(
      eq(sql`lower(btrim(${hotels.name}))`, normalizeHotelName(name)),
      eq(sql`lower(btrim(${hotels.city}))`, normalizeHotelName(city)),
    ) as SQL;
    const where = excludeId ? (and(ne(hotels.id, excludeId), match) as SQL) : match;
    const [existing] = await this.tenantDb.select(hotels, where);
    if (existing) throw new ConflictException(`A hotel "${name}" in ${city} already exists`);
  }

  private isUniqueViolation(err: unknown): boolean {
    const code = (e: unknown): string | undefined =>
      typeof e === "object" && e !== null ? (e as { code?: string }).code : undefined;
    if (code(err) === "23505") return true;
    const cause = typeof err === "object" && err !== null ? (err as { cause?: unknown }).cause : undefined;
    return code(cause) === "23505";
  }

  async create(input: CreateHotelInput): Promise<DbHotel> {
    await this.assertNoConflict(input.name, input.city);
    try {
      const [row] = await this.tenantDb.insertValues(hotels, {
        id: ulid(),
        name: input.name,
        city: input.city,
        stars: input.stars ?? 3,
        distanceM: input.distanceM ?? null,
        isPelataran: input.isPelataran ?? false,
        isActive: input.isActive ?? true,
      });
      if (!row) throw new Error("Insert returned no row");
      this.logger.info({ hotelId: (row as DbHotel).id }, "hotel.created");
      return row as DbHotel;
    } catch (err) {
      if (this.isUniqueViolation(err)) throw new ConflictException(`A hotel "${input.name}" in ${input.city} already exists`);
      throw err;
    }
  }

  async update(id: string, input: UpdateHotelInput): Promise<DbHotel> {
    const existing = await this.findById(id);
    if (!existing) throw new NotFoundException("Hotel not found");
    const nextName = input.name ?? existing.name;
    const nextCity = input.city ?? existing.city;
    if (
      normalizeHotelName(nextName) !== normalizeHotelName(existing.name) ||
      normalizeHotelName(nextCity) !== normalizeHotelName(existing.city)
    ) {
      await this.assertNoConflict(nextName, nextCity, id);
    }
    try {
      const [row] = await this.tenantDb.update(hotels, { ...input }, eq(hotels.id, id));
      if (!row) throw new NotFoundException("Hotel not found");
      this.logger.info({ hotelId: id }, "hotel.updated");
      return row as DbHotel;
    } catch (err) {
      if (this.isUniqueViolation(err)) throw new ConflictException(`A hotel "${nextName}" in ${nextCity} already exists`);
      throw err;
    }
  }

  async remove(id: string): Promise<void> {
    const existing = await this.findById(id);
    if (!existing) throw new NotFoundException("Hotel not found");
    const inUse = await this.db.$count(packageHotels, eq(packageHotels.hotelId, id));
    if (inUse > 0) {
      throw new ConflictException(`Hotel is in use by ${inUse} package(s); deactivate it instead of deleting`);
    }
    await this.tenantDb.deleteFrom(hotels, eq(hotels.id, id));
    this.logger.info({ hotelId: id }, "hotel.deleted");
  }
}
```

- [x] **Step 6: Create `hotels.controller.ts`** (mirror `airlines.controller.ts`).

```ts
import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../auth/roles.decorator";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import {
  createHotelSchema, updateHotelSchema,
  type CreateHotelInput, type UpdateHotelInput, type HotelDto,
} from "@cometkit/shared";
import { HotelsService } from "./hotels.service";
import { toHotelDto } from "./hotels.policy";

@Controller("hotels")
@UseGuards(JwtAuthGuard, RolesGuard)
export class HotelsController {
  constructor(private readonly service: HotelsService) {}

  @Get()
  async list(): Promise<HotelDto[]> {
    return (await this.service.list()).map(toHotelDto);
  }

  @Post()
  @Roles("admin")
  async create(@Body(new ZodValidationPipe(createHotelSchema)) input: CreateHotelInput): Promise<HotelDto> {
    return toHotelDto(await this.service.create(input));
  }

  @Patch(":id")
  @Roles("admin")
  async update(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateHotelSchema)) input: UpdateHotelInput,
  ): Promise<HotelDto> {
    return toHotelDto(await this.service.update(id, input));
  }

  @Delete(":id")
  @Roles("admin")
  async remove(@Param("id") id: string): Promise<{ ok: true }> {
    await this.service.remove(id);
    return { ok: true };
  }
}
```

- [x] **Step 7: Create `hotels.module.ts`** and register it.

```ts
import { Module } from "@nestjs/common";
import { HotelsController } from "./hotels.controller";
import { HotelsService } from "./hotels.service";

@Module({
  controllers: [HotelsController],
  providers: [HotelsService],
  exports: [HotelsService],
})
export class HotelsModule {}
```

In `apps/api/src/app.module.ts`, import `HotelsModule` and add it to the `imports` array (next to `AirlinesModule`).

- [x] **Step 8: Write the integration spec** — `apps/api/src/hotels/hotels.service.int.spec.ts` (mirror `airlines.service.int.spec.ts`; cover create, duplicate name+city rejected, unreferenced delete, delete blocked when referenced). Use `packageHotels` for the reference case:

```ts
import { ConflictException } from "@nestjs/common";
import { config } from "dotenv";
import { resolve } from "node:path";
import { ulid } from "ulid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ClsService } from "nestjs-cls";
import {
  createDb, tenants, providers, packages, packageHotels, hotels, type Database,
} from "@cometkit/db";
import { eq, inArray } from "drizzle-orm";
import { DEFAULT_TENANT_SLUG } from "@cometkit/shared";
import { TenantScopedDb } from "../tenancy/tenant-scoped-db";
import { HotelsService } from "./hotels.service";

config({ path: resolve(__dirname, "../../../../.env") });
const noopLogger = { info: () => undefined, warn: () => undefined, error: () => undefined } as never;

describe("HotelsService (integration)", () => {
  let db: Database;
  let service: HotelsService;
  let tenantId: string;
  const suffix = ulid().toLowerCase();
  const createdHotelIds: string[] = [];
  const createdPackageIds: string[] = [];
  const createdProviderIds: string[] = [];

  async function createProvider(): Promise<string> {
    const id = ulid();
    await db.insert(providers).values({
      id, tenantId, name: `PT. Hotel Provider ${suffix}-${id.slice(-6)}`, brandName: "Brand",
      ppiuLicenseNo: `PPIU-${id.slice(-6)}`, accreditation: "A", contactPerson: "Budi",
      contactPhone: "62812345678", isActive: true, pricePublicationConsentAt: new Date(),
    });
    createdProviderIds.push(id);
    return id;
  }

  beforeAll(async () => {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL required for integration tests");
    db = createDb(url);
    const [tenant] = await db.select().from(tenants).where(eq(tenants.slug, DEFAULT_TENANT_SLUG));
    if (!tenant) throw new Error("Default tenant not seeded - run bun run db:seed first");
    tenantId = tenant.id;
    const cls = { get: () => tenantId } as unknown as ClsService;
    service = new HotelsService(new TenantScopedDb(db, cls), db, noopLogger);
  });

  afterAll(async () => {
    if (createdPackageIds.length) await db.delete(packageHotels).where(inArray(packageHotels.packageId, createdPackageIds));
    if (createdPackageIds.length) await db.delete(packages).where(inArray(packages.id, createdPackageIds));
    if (createdHotelIds.length) await db.delete(hotels).where(inArray(hotels.id, createdHotelIds));
    if (createdProviderIds.length) await db.delete(providers).where(inArray(providers.id, createdProviderIds));
  });

  it("creates a hotel scoped to the tenant", async () => {
    const hotel = await service.create({ name: `Hilton ${suffix}`, city: "Makkah", stars: 5, isPelataran: true });
    createdHotelIds.push(hotel.id);
    expect(hotel.id).toHaveLength(26);
    expect(hotel.tenantId).toBe(tenantId);
    expect(hotel.city).toBe("Makkah");
  });

  it("allows the same name in a different city", async () => {
    const a = await service.create({ name: `DupCity ${suffix}`, city: "Makkah", stars: 4 });
    const b = await service.create({ name: `Dupcity ${suffix}`, city: "Madinah", stars: 4 });
    createdHotelIds.push(a.id, b.id);
    expect(b.id).not.toBe(a.id);
  });

  it("rejects a duplicate normalized name+city", async () => {
    const first = await service.create({ name: `Zamzam ${suffix}`, city: "Makkah", stars: 3 });
    createdHotelIds.push(first.id);
    await expect(service.create({ name: `  zamzam ${suffix} `, city: " makkah " })).rejects.toBeInstanceOf(ConflictException);
  });

  it("removes an unreferenced hotel", async () => {
    const hotel = await service.create({ name: `Unused ${suffix}`, city: "Madinah", stars: 3 });
    await service.remove(hotel.id);
    expect(await service.findById(hotel.id)).toBeUndefined();
  });

  it("blocks removal of a referenced hotel", async () => {
    const providerId = await createProvider();
    const hotel = await service.create({ name: `InUse ${suffix}`, city: "Makkah", stars: 5 });
    createdHotelIds.push(hotel.id);
    const [pkg] = await db.insert(packages).values({
      id: ulid(), tenantId, providerId, productType: "umrah",
      title: "Pkg ref hotel", slug: `pkg-ref-hotel-${suffix}`,
    }).returning();
    createdPackageIds.push(pkg!.id);
    await db.insert(packageHotels).values({ id: ulid(), packageId: pkg!.id, hotelId: hotel.id });
    await expect(service.remove(hotel.id)).rejects.toBeInstanceOf(ConflictException);
    expect(await service.findById(hotel.id)).toBeDefined();
  });
});
```

- [x] **Step 9: Run the unit + int tests**

Run: `cd apps/api && bunx vitest run src/hotels/hotels.policy.spec.ts` (PASS)
Run (needs Postgres): `bun run test:int -- hotels` (PASS — all 5 int cases)

- [x] **Step 10: Commit**

```bash
git add apps/api/src/hotels apps/api/src/app.module.ts
git commit -m "feat(api): hotels catalog module mirroring airlines (hotel-master-catalog 3.1-3.4)"
```

archived-with: 2026-07-08-hotel-master-catalog
---

### Task 5: API — wire package attach/detach, DTO join, search, publish policy

**Files:**
- Modify: `apps/api/src/packages/packages.service.ts` (`findOne` hotels join; `addHotel` → by hotelId; add `removeHotel`)
- Modify: `apps/api/src/packages/packages.controller.ts` (attach body + detach route)
- Modify: `apps/api/src/search/search.service.ts` (hotel lateral + filters join hotels)
- Modify: `apps/api/src/packages/packages.policy.spec.ts` (Makkah check still passes on joined cityName)
- Modify: `apps/api/src/packages/packages.service.int.spec.ts` (attach-by-id, dup/cross-tenant reject, detach, publish)
- Modify: `apps/api/src/search/search.service.int.spec.ts` (seed hotels via catalog)

**Interfaces:**
- Consumes: `hotels`, `packageHotels` from `@cometkit/db`; `HotelInput = { hotelId }`.
- Produces: `PackagesService.addHotel(packageId, { hotelId })`, `PackagesService.removeHotel(packageId, hotelId)`; `findOne().hotels` = `PackageHotelDto[]`.

- [x] **Step 1: Update the `findOne` hotels join** in `packages.service.ts`. Add `hotels` to the `@cometkit/db` import. Replace the current hotels fetch (`select().from(packageHotels).where(...)`) with a join, and replace the `hotels: hotels.map(...)` mapping in the return object:

```ts
// fetch (replaces the old select from packageHotels)
const hotelRows = await this.db
  .select({
    hotelId: hotels.id,
    cityName: hotels.city,
    name: hotels.name,
    stars: hotels.stars,
    distanceM: hotels.distanceM,
    isPelataran: hotels.isPelataran,
  })
  .from(packageHotels)
  .innerJoin(hotels, eq(packageHotels.hotelId, hotels.id))
  .where(eq(packageHotels.packageId, id));
```

```ts
// in the returned object, replace the hotels mapping with:
hotels: hotelRows,
```

(The local `const hotels` name would now clash with the imported `hotels` table — rename the local to `hotelRows` as above. Verify no other reference to the old local `hotels` remains in `findOne`.)

- [x] **Step 2: Rewrite `addHotel` and add `removeHotel`** in `packages.service.ts`. Ensure `packages`, `hotels`, `packageHotels`, `BadRequestException`, `ConflictException`, `NotFoundException`, `and`, `eq`, `ulid` are imported.

```ts
async addHotel(packageId: string, input: HotelInput): Promise<DbPackageHotel> {
  const [pkg] = await this.db.select().from(packages)
    .where(and(eq(packages.tenantId, this.tenantDb.tenantId), eq(packages.id, packageId))).limit(1);
  if (!pkg) throw new NotFoundException("Package not found");

  const [hotel] = await this.db.select().from(hotels)
    .where(and(eq(hotels.tenantId, this.tenantDb.tenantId), eq(hotels.id, input.hotelId))).limit(1);
  if (!hotel) throw new BadRequestException("hotel (not found in this tenant)");

  try {
    const [created] = await this.db.insert(packageHotels)
      .values({ id: ulid(), packageId, hotelId: input.hotelId }).returning();
    if (!created) throw new Error("Insert returned no hotel");
    this.logger.info({ packageId, hotelId: input.hotelId }, "package.hotel_attached");
    return created;
  } catch (err) {
    const code = (e: unknown) => (typeof e === "object" && e !== null ? (e as { code?: string }).code : undefined);
    const cause = (err as { cause?: unknown })?.cause;
    if (code(err) === "23505" || code(cause) === "23505") {
      throw new ConflictException("Hotel already attached to this package");
    }
    throw err;
  }
}

async removeHotel(packageId: string, hotelId: string): Promise<void> {
  const [pkg] = await this.db.select().from(packages)
    .where(and(eq(packages.tenantId, this.tenantDb.tenantId), eq(packages.id, packageId))).limit(1);
  if (!pkg) throw new NotFoundException("Package not found");
  await this.db.delete(packageHotels)
    .where(and(eq(packageHotels.packageId, packageId), eq(packageHotels.hotelId, hotelId)));
  this.logger.info({ packageId, hotelId }, "package.hotel_detached");
}
```

- [x] **Step 3: Update the controller** in `packages.controller.ts` — the `addHotel` handler now validates the `{ hotelId }` body, and add a detach route. Import `createAttachHotelSchema`? No — keep it simple; validate inline with the existing `HotelInput` type + a small Zod schema. Add to shared `hotels.ts` an `attachHotelSchema` for the body:

  In `packages/shared/src/hotels.ts` add:
  ```ts
  export const attachHotelSchema = z.object({ hotelId: z.string().length(26) });
  ```
  Then in `packages.controller.ts`:

```ts
@Post(":id/hotels")
@Roles("admin")
async addHotel(
  @Param("id") id: string,
  @Body(new ZodValidationPipe(attachHotelSchema)) hotel: HotelInput,
) {
  return this.packagesService.addHotel(id, hotel);
}

@Delete(":id/hotels/:hotelId")
@Roles("admin")
async removeHotel(@Param("id") id: string, @Param("hotelId") hotelId: string): Promise<{ ok: true }> {
  await this.packagesService.removeHotel(id, hotelId);
  return { ok: true };
}
```

Ensure `Delete` and `attachHotelSchema` are imported in the controller.

- [x] **Step 4: Update the search service** in `search.service.ts` — join `hotels` in the lateral and the two EXISTS subqueries. Replace the `hotelLateral` and the two hotel clauses in `filters`:

```ts
const hotelLateral = sql`
  left join lateral (
    select coalesce(json_agg(json_build_object(
      'cityName', h.city, 'name', h.name,
      'stars', h.stars, 'distanceM', h.distance_m)), '[]'::json) as hotels
    from package_hotels ph join hotels h on h.id = ph.hotel_id
    where ph.package_id = p.id
  ) hj on true`;
```

In `filters`, the q-clause hotel EXISTS:
```ts
   or exists (select 1 from package_hotels phq join hotels hq on hq.id = phq.hotel_id
              where phq.package_id = p.id and hq.name ilike '%' || ${params.q ?? null} || '%'))
```

and the hotelCity EXISTS:
```ts
  and (${params.hotelCity ?? null}::text is null or exists (
        select 1 from package_hotels phc join hotels hc on hc.id = phc.hotel_id
        where phc.package_id = p.id
          and hc.city = ${params.hotelCity ?? null}
          and (${params.maxDistanceM ?? null}::int is null or hc.distance_m <= ${params.maxDistanceM ?? null}::int)
          and (${params.minStars ?? null}::int is null or hc.stars >= ${params.minStars ?? null}::int)))`;
```

The `hotels` local type on line 39 (`{ cityName; name; stars; distanceM }`) and `hotels: r.hotels` stay unchanged — output shape is identical.

- [x] **Step 5: Update the affected int specs.** In `search.service.int.spec.ts` and `search.benchmark.int.spec.ts`, the helper that inserts `packageHotels` with `cityName/name/stars/...` must instead create a catalog hotel and link it. Replace each `db.insert(packageHotels).values({ id, packageId, cityName, name, stars, distanceM, isPelataran })` with:

```ts
const [h] = await db.insert(hotels).values({
  id: ulid(), tenantId, name: opts.hotelName!, city: "Makkah", stars: 5, distanceM: 150, isPelataran: false,
}).returning();
createdHotelIds.push(h!.id);
await db.insert(packageHotels).values({ id: ulid(), packageId: id, hotelId: h!.id });
```

Add `hotels` to the `@cometkit/db` import and a `createdHotelIds` cleanup array (delete package_hotels first, then hotels, in `afterAll`/cleanup). Do the same for the `far3`/min-stars case (city Makkah, stars 3, distance 900). In `packages.service.int.spec.ts`, replace each `service.addHotel(pkg.id, { cityName, name, stars, distanceM, isPelataran })` call with: create a catalog hotel via the db (or a `HotelsService`), then `service.addHotel(pkg.id, { hotelId })`; add a case asserting duplicate attach throws `ConflictException` and a case asserting `removeHotel` detaches. The publish-flow case must attach a **Makkah** catalog hotel so publish passes.

- [x] **Step 6: `packages.policy.spec.ts`** — the Makkah check reads `h.cityName`; update the spec's fixture hotels to the new `PackageHotelDto` shape (`{ hotelId, cityName, name, stars, distanceM, isPelataran }`). The policy code itself (`packages.policy.ts`) needs no change — it already reads `cityName`.

- [x] **Step 7: Run API tests**

Run: `cd apps/api && bunx vitest run src/packages/packages.policy.spec.ts` (PASS)
Run (Postgres): `bun run test:int` (PASS — packages, hotels, search)

- [x] **Step 8: Commit**

```bash
git add apps/api/src/packages apps/api/src/search packages/shared/src/hotels.ts
git commit -m "feat(api): attach/detach by hotelId, DTO+search join catalog (hotel-master-catalog 4.1-4.4)"
```

archived-with: 2026-07-08-hotel-master-catalog
---

### Task 6: Web — hotel catalog admin

**Files:**
- Create: `apps/web/src/hooks/use-hotels.ts`
- Modify: `apps/web/src/app/dashboard/settings/master-data/page.tsx` (add Hotels admin section)

**Interfaces:**
- Consumes: `HotelDto`, `CreateHotelInput`, `UpdateHotelInput` from `@cometkit/shared`.
- Produces: `useHotels`, `useCreateHotel`, `useUpdateHotel`, `useDeleteHotel`.

- [x] **Step 1: Create `use-hotels.ts`** (mirror `use-airlines.ts`):

```ts
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { HotelDto, CreateHotelInput, UpdateHotelInput } from "@cometkit/shared";
import { api } from "@/lib/api";

export const hotelsKeys = { all: ["hotels"] as const };

export function useHotels() {
  return useQuery<HotelDto[]>({
    queryKey: hotelsKeys.all,
    queryFn: () => api.get("hotels").json<HotelDto[]>(),
  });
}

export function useCreateHotel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateHotelInput) => api.post("hotels", { json: input }).json<HotelDto>(),
    onSuccess: () => qc.invalidateQueries({ queryKey: hotelsKeys.all }),
  });
}

export function useUpdateHotel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: UpdateHotelInput & { id: string }) =>
      api.patch(`hotels/${id}`, { json: input }).json<HotelDto>(),
    onSuccess: () => qc.invalidateQueries({ queryKey: hotelsKeys.all }),
  });
}

export function useDeleteHotel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`hotels/${id}`).json<{ ok: true }>(),
    onSuccess: () => qc.invalidateQueries({ queryKey: hotelsKeys.all }),
  });
}
```

- [x] **Step 2: Add a Hotels admin section** to `master-data/page.tsx`. Retitle the page header from "Airlines & Departure Cities" to "Airlines, Departure Cities & Hotels". Below the two `MasterList`s, add a `HotelList` component (a richer inline component in the same file, since a hotel has more than name+isActive). It provides: an add form (name; city = select `Makkah`/`Madinah`/`Transit…` where Transit reveals a free-text input; stars 1-5; distance; pelataran checkbox), a list with inline edit of those fields, `isActive` toggle, and delete behind `useConfirm`. Reuse the existing `guard(...)` + `readApiError` error pattern and the `confirm(...)` idiom already in the file. Wire it to `useHotels/useCreateHotel/useUpdateHotel/useDeleteHotel`. Key detail — the city control:

```tsx
// city entry: canonical select + transit escape
const CANONICAL_CITIES = ["Makkah", "Madinah"] as const;
// state: cityMode: "Makkah" | "Madinah" | "transit"; transitCity: string
// resolved city = cityMode === "transit" ? transitCity.trim() : cityMode
```

Guard the whole section behind the existing `me.role === "admin"` check already at the top of the page.

- [x] **Step 3: Typecheck + lint web**

Run: `cd apps/web && bunx tsc --noEmit && bun run lint`
Expected: PASS.

- [x] **Step 4: Commit**

```bash
git add apps/web/src/hooks/use-hotels.ts apps/web/src/app/dashboard/settings/master-data/page.tsx
git commit -m "feat(web): hotel catalog admin under master data (hotel-master-catalog 5.1-5.2)"
```

archived-with: 2026-07-08-hotel-master-catalog
---

### Task 7: Web — package form hotel picker + detach

**Files:**
- Modify: `apps/web/src/app/dashboard/packages/[id]/page.tsx` (hotel card → picker; attach by hotelId; detach with confirm)

**Interfaces:**
- Consumes: `useHotels` (catalog), the package DTO `hotels: PackageHotelDto[]`, `useConfirm`.

- [x] **Step 1: Replace the "Add Hotel" free-text card** in `packages/[id]/page.tsx`. Keep the existing `city` select (Makkah / Madinah / `plusDestination`). Replace the name/stars/distance/pelataran inputs with a single hotel `<select>` populated from `useHotels()` filtered to `hotel.city === cityName && hotel.isActive`, minus hotels already attached (`pkg.hotels.some(h => h.hotelId === hotel.id)`). The submit handler calls `addHotel.mutateAsync({ id: pkg.id, hotelId: selectedHotelId })`. Update the `useAddHotel` hook call site so its input is `{ hotelId }` (the hook posts to `:id/hotels`).

- [x] **Step 2: Update the attach hook + add a detach hook** — in the packages hooks file (where `useAddHotel` lives, `apps/web/src/hooks/use-packages.ts` or similar; find via the `useAddHotel` import at `[id]/page.tsx:15`). Change `useAddHotel`'s mutation input to `{ id: string; hotelId: string }` posting `{ hotelId }`. Add `useDetachHotel` posting `DELETE packages/${id}/hotels/${hotelId}`, invalidating the package query.

```ts
export function useDetachHotel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, hotelId }: { id: string; hotelId: string }) =>
      api.delete(`packages/${id}/hotels/${hotelId}`).json<{ ok: true }>(),
    onSuccess: (_d, { id }) => qc.invalidateQueries({ queryKey: /* package detail key */ ["packages", id] }),
  });
}
```

(Match the existing query-key convention used by the package-detail query in that hooks file.)

- [x] **Step 3: Render attached hotels with a confirm-gated detach button.** The attached list already maps `pkg.hotels`; each row now has `h.hotelId`. Add a detach button:

```tsx
const confirm = useConfirm();
// ...
<Button
  type="button" variant="ghost" size="sm"
  className="text-destructive hover:bg-destructive/10"
  onClick={async () => {
    if (!(await confirm({
      title: "Remove this hotel?",
      description: `“${h.name}” will be detached from this package. You can re-attach it from the catalog.`,
      confirmLabel: "Remove",
    }))) return;
    await detachHotel.mutateAsync({ id: pkg.id, hotelId: h.hotelId });
  }}
>
  Remove
</Button>
```

Import `useConfirm` from `@/hooks/use-confirm` (already used elsewhere). Keep the whole hotel card admin-gated (`isAdmin`) as it is today.

- [x] **Step 4: Typecheck + lint web**

Run: `cd apps/web && bunx tsc --noEmit && bun run lint`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add apps/web/src/app/dashboard/packages apps/web/src/hooks
git commit -m "feat(web): catalog hotel picker + confirm-gated detach (hotel-master-catalog 6.1-6.2)"
```

archived-with: 2026-07-08-hotel-master-catalog
---

### Task 8: Full verify + manual smoke

- [x] **Step 1: Run the quality gate**

Run: `bun run verify`
Expected: typecheck + lint + test all PASS across packages.

- [x] **Step 2: Run integration tests**

Run (Postgres up, seeded): `cd apps/api && bun run test:int`
Expected: PASS (hotels, packages, search).

- [x] **Step 3: Manual smoke** (with `bun run dev`, logged in as admin):
  1. Settings → master data: create a Makkah hotel → it appears; create a duplicate name+city → conflict error shown.
  2. Open a package form → city Makkah → the new hotel is in the picker → attach it → it shows in the attached list; the picker no longer offers it.
  3. Detach it → confirm dialog appears → confirm → it's removed and returns to the picker.
  4. Attach a Makkah hotel and publish → succeeds; remove all Makkah hotels and publish → blocked with "hotels (Makkah)".
  5. Deactivate a hotel that a package uses → it's hidden from the picker but still shown on the using package; delete it → blocked ("in use").
  6. Search by hotel name / hotel city + min stars → results correct.

- [x] **Step 4: Tick tasks.md and run the build guard** (per the comet-build exit flow — do this in the coordinating session, not as a plan step).

archived-with: 2026-07-08-hotel-master-catalog
---

## Self-Review

- **Spec coverage:** catalog table + uniqueness (T2), admin CRUD + delete-guard + non-admin (T4), canonical-city input (T6), active-filter + keep-assigned + detach (T7), link table + attach/dedup/cross-tenant (T5), migration + demo seed (T3), DTO `hotelId` (T1/T5), publish Makkah rule (T5 policy spec). All `hotel-master-catalog` and `package-catalog` delta requirements map to a task.
- **Placeholder scan:** all code steps contain real code; the only "find the exact hooks file / query key" notes (T7) are because the packages hooks filename/query-key are discovered at implementation time — the shapes are fully specified.
- **Type consistency:** `HotelInput = { hotelId }`, `PackageHotelDto = { hotelId, cityName, name, stars, distanceM, isPelataran }`, `HotelDto` catalog shape, `toHotelDto`, `normalizeHotelName`, `addHotel({ hotelId })`, `removeHotel(packageId, hotelId)` — consistent across tasks.
