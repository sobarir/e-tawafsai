---
change: airline-departure-city-master-data
design-doc: docs/superpowers/specs/2026-07-07-airline-departure-city-master-data-design.md
base-ref: 106a4083c073cda755660c2675ae63f550aaae47
---

# Airline & Departure City Master Data Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (or superpowers:subagent-driven-development) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the free-text `airline` / `departureCity` package fields with two tenant-global admin-managed master tables (`airlines`, `departure_cities`), referenced by nullable FKs, selected via form dropdowns.

**Architecture:** Two new Drizzle tables + FK cutover migration (mirrors `drizzle/0016`). Two Nest CRUD modules copied from `categories`. Packages/search read paths resolve names via join. Web: two admin sections under Settings + form dropdowns.

**Tech Stack:** Drizzle ORM (postgres-js), NestJS, Zod 4, TanStack Query, Next.js App Router, shadcn/ui, Vitest, bun.

## Global Constraints

- Wire shapes (Zod request schemas + response interfaces) live in `packages/shared`; columns live in `packages/db`; dependency direction `shared ← db ← api`, `shared ← web`. Never reverse. No drizzle-zod.
- Under Vitest, import zod as `import * as z from "zod"` (never `import { z }`).
- Run `.ts` scripts with `bun file.ts`; export bun PATH first: `export PATH="/c/Users/rahma/.bun/bin:$PATH"`.
- Always `db:migrate` before `db:seed`.
- Nest route order: static segments before parameterized (`:id`).
- New runtime imports must be declared in that package's `package.json`.
- API errors: throw Nest `HttpException` subclasses; never try/catch to shape errors in controllers. Web: read errors only via `readApiError()`, render near the action with `role="alert"`.
- Services log domain events: `this.logger.info({ id }, "noun.verb")`.
- Query keys `[resource, params]`; mutations invalidate the resource root.
- THE quality gate: `bun run verify` (typecheck + lint + unit) must pass; DB-touching paths also `bun run test:int` (in `apps/api`).
- ULID pk via `ulidPk()`, FK via `ulidRef(name)` (both `char(26)`); timestamps via `timestamps` helper (`packages/db/src/columns.ts`).

---

### Task 1: Shared master-data contracts

**Files:**
- Create: `packages/shared/src/master-data.ts`
- Modify: `packages/shared/src/index.ts` (add `export * from "./master-data";` after the categories line)
- Test: `packages/shared/src/master-data.spec.ts`

**Interfaces:**
- Produces: `createAirlineSchema`, `updateAirlineSchema`, `createDepartureCitySchema`, `updateDepartureCitySchema` (Zod); `CreateAirlineInput`, `UpdateAirlineInput`, `CreateDepartureCityInput`, `UpdateDepartureCityInput` (types); `AirlineDto`, `DepartureCityDto` (interfaces). Airline and departure-city share an identical shape — both schemas are structurally the same (`name`, optional `isActive`).

- [ ] **Step 1: Write the failing test**

```ts
// packages/shared/src/master-data.spec.ts
import { describe, it, expect } from "vitest";
import {
  createAirlineSchema,
  updateAirlineSchema,
  createDepartureCitySchema,
} from "./master-data";

describe("master-data schemas", () => {
  it("accepts a valid airline create", () => {
    const r = createAirlineSchema.parse({ name: "Garuda Indonesia" });
    expect(r.name).toBe("Garuda Indonesia");
    expect(r.isActive).toBe(true); // defaults to active
  });

  it("rejects a blank name", () => {
    expect(() => createAirlineSchema.parse({ name: "" })).toThrow();
  });

  it("allows isActive on update without name", () => {
    const r = updateAirlineSchema.parse({ isActive: false });
    expect(r.isActive).toBe(false);
  });

  it("departure-city create mirrors airline", () => {
    const r = createDepartureCitySchema.parse({ name: "Jakarta" });
    expect(r.name).toBe("Jakarta");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/shared && bun run vitest run src/master-data.spec.ts`
Expected: FAIL — cannot resolve `./master-data`.

- [ ] **Step 3: Create the schemas**

```ts
// packages/shared/src/master-data.ts
import * as z from "zod";

export const createAirlineSchema = z.object({
  name: z.string().min(1).max(120),
  isActive: z.boolean().default(true),
});
export const updateAirlineSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  isActive: z.boolean().optional(),
});

// Departure city shares the exact same shape as airline.
export const createDepartureCitySchema = createAirlineSchema;
export const updateDepartureCitySchema = updateAirlineSchema;

export type CreateAirlineInput = z.input<typeof createAirlineSchema>;
export type UpdateAirlineInput = z.input<typeof updateAirlineSchema>;
export type CreateDepartureCityInput = z.input<typeof createDepartureCitySchema>;
export type UpdateDepartureCityInput = z.input<typeof updateDepartureCitySchema>;

interface MasterRowDto {
  id: string;
  tenantId: string;
  name: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}
export type AirlineDto = MasterRowDto;
export type DepartureCityDto = MasterRowDto;
```

- [ ] **Step 4: Wire the index export**

Add to `packages/shared/src/index.ts` immediately after `export * from "./categories";`:

```ts
export * from "./master-data";
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd packages/shared && bun run vitest run src/master-data.spec.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/master-data.ts packages/shared/src/master-data.spec.ts packages/shared/src/index.ts
git commit -m "feat(shared): airline & departure-city master-data schemas and DTOs"
```

---

### Task 2: Package contract switch to FK ids

**Files:**
- Modify: `packages/shared/src/packages.ts`
- Test: `packages/shared/src/packages.spec.ts` (create if absent)

**Interfaces:**
- Consumes: nothing new.
- Produces: `createPackageSchema` / `updatePackageSchema` carry nullable `airlineId` / `departureCityId` (length-26) instead of free-text `airline` / `departureCity`; `publishPackageSchema` requires both ids; `PackageDto` carries `airlineId`, `departureCityId`, `airlineName`, `departureCityName` and drops `airline` / `departureCity`. `flightRoute` is unchanged.

- [ ] **Step 1: Write the failing test**

```ts
// packages/shared/src/packages.spec.ts
import { describe, it, expect } from "vitest";
import { createPackageSchema, publishPackageSchema } from "./packages";

const ULID = "01HZZZZZZZZZZZZZZZZZZZZZZZZ"; // 26 chars

describe("package schema FK ids", () => {
  it("accepts nullable airlineId / departureCityId on create", () => {
    const r = createPackageSchema.parse({
      title: "X", providerId: ULID, airlineId: null, departureCityId: null,
    });
    expect(r.airlineId).toBeNull();
  });

  it("publish requires airlineId and departureCityId", () => {
    expect(() =>
      publishPackageSchema.parse({ durationDays: 9, categoryId: ULID, departureCityId: ULID }),
    ).toThrow();
    const ok = publishPackageSchema.parse({
      durationDays: 9, categoryId: ULID, airlineId: ULID, departureCityId: ULID,
    });
    expect(ok.airlineId).toBe(ULID);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/shared && bun run vitest run src/packages.spec.ts`
Expected: FAIL — `airlineId` unknown / publish accepts missing airlineId.

- [ ] **Step 3: Edit `packages/shared/src/packages.ts`**

In `createPackageSchema`, replace the two lines:
```ts
  airline: z.string().max(120).nullable().optional(),
  ...
  departureCity: z.string().max(120).nullable().optional(),
```
with:
```ts
  airlineId: z.string().length(26).nullable().optional(),
  ...
  departureCityId: z.string().length(26).nullable().optional(),
```
(keep `flightRoute` between them exactly as-is).

In `publishPackageSchema`, replace:
```ts
  airline: z.string().min(1).max(120),
  departureCity: z.string().min(1).max(120),
```
with:
```ts
  airlineId: z.string().length(26),
  departureCityId: z.string().length(26),
```

In `PackageDto`, replace `airline: string | null;` and `departureCity: string | null;` with:
```ts
  airlineId: string | null;
  airlineName: string | null;
  departureCityId: string | null;
  departureCityName: string | null;
```
(keep `flightRoute: string | null;`).

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/shared && bun run vitest run src/packages.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/packages.ts packages/shared/src/packages.spec.ts
git commit -m "feat(shared): package schema uses airlineId/departureCityId FKs"
```

---

### Task 3: DB schema — master tables + FK columns

**Files:**
- Modify: `packages/db/src/schema/packages.ts`

**Interfaces:**
- Produces: `airlines`, `departureCities` tables + `DbAirline`, `NewDbAirline`, `DbDepartureCity`, `NewDbDepartureCity` types; `packages.airlineId`, `packages.departureCityId` nullable FK columns; the `airline` / `departureCity` varchars removed from the table definition.

- [ ] **Step 1: Add the master tables**

In `packages/db/src/schema/packages.ts`, after the `packageCategories` block (and its exported types), add:

```ts
export const airlines = pgTable("airlines", {
  id: ulidPk(),
  ...tenantOwned(),
  name: varchar("name", { length: 120 }).notNull(),
  isActive: boolean("is_active").notNull().default(true),
  ...timestamps,
}, (t) => [
  uniqueIndex("airlines_tenant_name_idx").on(t.tenantId, sql`lower(btrim(${t.name}))`),
]);

export const departureCities = pgTable("departure_cities", {
  id: ulidPk(),
  ...tenantOwned(),
  name: varchar("name", { length: 120 }).notNull(),
  isActive: boolean("is_active").notNull().default(true),
  ...timestamps,
}, (t) => [
  uniqueIndex("departure_cities_tenant_name_idx").on(t.tenantId, sql`lower(btrim(${t.name}))`),
]);

export type DbAirline = typeof airlines.$inferSelect;
export type NewDbAirline = typeof airlines.$inferInsert;
export type DbDepartureCity = typeof departureCities.$inferSelect;
export type NewDbDepartureCity = typeof departureCities.$inferInsert;
```

(`sql`, `uniqueIndex`, `boolean`, `varchar` are already imported at the top of this file.)

- [ ] **Step 2: Swap the package columns to FKs**

In the `packages` table definition, replace:
```ts
  airline: varchar("airline", { length: 120 }),
  flightRoute: varchar("flight_route", { length: 255 }),
  departureCity: varchar("departure_city", { length: 120 }),
```
with:
```ts
  airlineId: ulidRef("airline_id").references(() => airlines.id),
  flightRoute: varchar("flight_route", { length: 255 }),
  departureCityId: ulidRef("departure_city_id").references(() => departureCities.id),
```

- [ ] **Step 3: Typecheck the db package**

Run: `cd packages/db && bun run typecheck` (or `bunx tsc --noEmit`)
Expected: PASS (schema compiles; downstream api errors are handled in later tasks — do not fix them here).

- [ ] **Step 4: Commit**

```bash
git add packages/db/src/schema/packages.ts
git commit -m "feat(db): airlines & departure_cities tables + package FK columns"
```

---

### Task 4: Migration — additive DDL, backfill, cutover

**Files:**
- Create: `packages/db/drizzle/00NN_<generated>.sql` (via `db:generate`, then hand-edited)

**Interfaces:**
- Consumes: Task 3 schema.
- Produces: a migration that creates both tables, adds both FK columns, backfills every tenant's distinct non-blank values, repoints packages, and drops the old varchars.

- [ ] **Step 1: Generate the additive DDL migration**

Run: `cd packages/db && bun run db:generate`
Expected: a new `drizzle/00NN_*.sql` creating `airlines`, `departure_cities`, adding `airline_id` / `departure_city_id`, and (drizzle will also emit) dropping `airline` / `departure_city`. Note the generated file path.

- [ ] **Step 2: Insert the backfill BEFORE the DROP statements**

Open the generated file. Ensure statement order is: (a) CREATE TABLE airlines/departure_cities; (b) ALTER TABLE packages ADD COLUMN airline_id / departure_city_id; (c) **[insert backfill here]**; (d) ALTER TABLE packages DROP COLUMN airline / departure_city. If drizzle placed the DROP before your backfill, move the DROP statements to the end. Insert these four statements (each terminated with `--> statement-breakpoint`) at point (c):

```sql
INSERT INTO "airlines" ("id", "tenant_id", "name", "is_active", "created_at", "updated_at")
SELECT DISTINCT ON (p."tenant_id", lower(btrim(p."airline")))
	upper(substr(md5(p."tenant_id" || lower(btrim(p."airline"))), 1, 26)),
	p."tenant_id", btrim(p."airline"), true, now(), now()
FROM "packages" p
WHERE p."airline" IS NOT NULL AND btrim(p."airline") <> ''
ON CONFLICT DO NOTHING;
--> statement-breakpoint
UPDATE "packages" p SET "airline_id" = a."id"
FROM "airlines" a
WHERE a."tenant_id" = p."tenant_id"
	AND lower(btrim(a."name")) = lower(btrim(p."airline"))
	AND p."airline" IS NOT NULL AND btrim(p."airline") <> '';
--> statement-breakpoint
INSERT INTO "departure_cities" ("id", "tenant_id", "name", "is_active", "created_at", "updated_at")
SELECT DISTINCT ON (p."tenant_id", lower(btrim(p."departure_city")))
	upper(substr(md5(p."tenant_id" || lower(btrim(p."departure_city"))), 1, 26)),
	p."tenant_id", btrim(p."departure_city"), true, now(), now()
FROM "packages" p
WHERE p."departure_city" IS NOT NULL AND btrim(p."departure_city") <> ''
ON CONFLICT DO NOTHING;
--> statement-breakpoint
UPDATE "packages" p SET "departure_city_id" = dc."id"
FROM "departure_cities" dc
WHERE dc."tenant_id" = p."tenant_id"
	AND lower(btrim(dc."name")) = lower(btrim(p."departure_city"))
	AND p."departure_city" IS NOT NULL AND btrim(p."departure_city") <> '';
```

- [ ] **Step 3: Apply the migration**

Run: `cd packages/db && bun run db:migrate`
Expected: migration applies without error. (If it fails, load `systematic-debugging` before editing — do not patch blindly.)

- [ ] **Step 4: Commit**

```bash
git add packages/db/drizzle
git commit -m "feat(db): migration backfills airline/city master data and drops varchars"
```

---

### Task 5: Airlines API module

**Files:**
- Create: `apps/api/src/airlines/airlines.policy.ts`, `airlines.service.ts`, `airlines.controller.ts`, `airlines.module.ts`
- Create: `apps/api/src/airlines/airlines.policy.spec.ts`
- Modify: `apps/api/src/app.module.ts` (register `AirlinesModule`)

**Interfaces:**
- Consumes: `TenantScopedDb`, `airlines` table, `Database`, shared airline schemas/DTO.
- Produces: `AirlinesService` with `list()`, `findById(id)`, `create(input)`, `update(id, input)`, `remove(id)`; `normalizeAirlineName(name)`, `toAirlineDto(row)`; REST at `/airlines`.

- [ ] **Step 1: Write the failing policy test**

```ts
// apps/api/src/airlines/airlines.policy.spec.ts
import { describe, it, expect } from "vitest";
import { normalizeAirlineName, toAirlineDto } from "./airlines.policy";

describe("airlines.policy", () => {
  it("normalizes name (trim + lowercase)", () => {
    expect(normalizeAirlineName("  Garuda Indonesia ")).toBe("garuda indonesia");
  });

  it("maps a row to a dto with ISO timestamps", () => {
    const now = new Date("2026-07-07T00:00:00Z");
    const dto = toAirlineDto({
      id: "a1", tenantId: "t1", name: "Saudia", isActive: true, createdAt: now, updatedAt: now,
    });
    expect(dto).toEqual({
      id: "a1", tenantId: "t1", name: "Saudia", isActive: true,
      createdAt: now.toISOString(), updatedAt: now.toISOString(),
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && bun run vitest run src/airlines/airlines.policy.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the policy**

```ts
// apps/api/src/airlines/airlines.policy.ts
import type { DbAirline } from "@cometkit/db";
import type { AirlineDto } from "@cometkit/shared";

export function normalizeAirlineName(name: string): string {
  return name.trim().toLowerCase();
}

export function toAirlineDto(row: DbAirline): AirlineDto {
  return {
    id: row.id,
    tenantId: row.tenantId,
    name: row.name,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && bun run vitest run src/airlines/airlines.policy.spec.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Write the service**

```ts
// apps/api/src/airlines/airlines.service.ts
import { Inject, Injectable, ConflictException, NotFoundException } from "@nestjs/common";
import { InjectPinoLogger, PinoLogger } from "nestjs-pino";
import { and, eq, ne, sql, type SQL } from "drizzle-orm";
import { ulid } from "ulid";
import { airlines, packages, type DbAirline, type Database } from "@cometkit/db";
import type { CreateAirlineInput, UpdateAirlineInput } from "@cometkit/shared";
import { TenantScopedDb } from "../tenancy/tenant-scoped-db";
import { DB } from "../database/database.module";
import { normalizeAirlineName } from "./airlines.policy";

@Injectable()
export class AirlinesService {
  constructor(
    private readonly tenantDb: TenantScopedDb,
    @Inject(DB) private readonly db: Database,
    @InjectPinoLogger(AirlinesService.name) private readonly logger: PinoLogger,
  ) {}

  async list(): Promise<DbAirline[]> {
    return (await this.tenantDb.select(airlines)) as DbAirline[];
  }

  async findById(id: string): Promise<DbAirline | undefined> {
    const [row] = await this.tenantDb.select(airlines, eq(airlines.id, id));
    return row as DbAirline | undefined;
  }

  private async assertNoNameConflict(name: string, excludeId?: string): Promise<void> {
    const match = eq(sql`lower(btrim(${airlines.name}))`, normalizeAirlineName(name)) as SQL;
    const where = excludeId ? (and(ne(airlines.id, excludeId), match) as SQL) : match;
    const [existing] = await this.tenantDb.select(airlines, where);
    if (existing) throw new ConflictException(`An airline named "${name}" already exists`);
  }

  private isUniqueViolation(err: unknown): boolean {
    const code = (e: unknown): string | undefined =>
      typeof e === "object" && e !== null ? (e as { code?: string }).code : undefined;
    if (code(err) === "23505") return true;
    const cause = typeof err === "object" && err !== null ? (err as { cause?: unknown }).cause : undefined;
    return code(cause) === "23505";
  }

  async create(input: CreateAirlineInput): Promise<DbAirline> {
    await this.assertNoNameConflict(input.name);
    try {
      const [row] = await this.tenantDb.insertValues(airlines, {
        id: ulid(), name: input.name, isActive: input.isActive ?? true,
      });
      if (!row) throw new Error("Insert returned no row");
      this.logger.info({ airlineId: (row as DbAirline).id }, "airline.created");
      return row as DbAirline;
    } catch (err) {
      if (this.isUniqueViolation(err)) throw new ConflictException(`An airline named "${input.name}" already exists`);
      throw err;
    }
  }

  async update(id: string, input: UpdateAirlineInput): Promise<DbAirline> {
    const existing = await this.findById(id);
    if (!existing) throw new NotFoundException("Airline not found");
    if (input.name && normalizeAirlineName(input.name) !== normalizeAirlineName(existing.name)) {
      await this.assertNoNameConflict(input.name, id);
    }
    try {
      const [row] = await this.tenantDb.update(airlines, { ...input }, eq(airlines.id, id));
      if (!row) throw new NotFoundException("Airline not found");
      this.logger.info({ airlineId: id }, "airline.updated");
      return row as DbAirline;
    } catch (err) {
      if (this.isUniqueViolation(err)) throw new ConflictException(`An airline named "${input.name}" already exists`);
      throw err;
    }
  }

  async remove(id: string): Promise<void> {
    const existing = await this.findById(id);
    if (!existing) throw new NotFoundException("Airline not found");
    const inUse = await this.db.$count(packages, eq(packages.airlineId, id));
    if (inUse > 0) {
      throw new ConflictException(`Airline is in use by ${inUse} package(s); deactivate it instead of deleting`);
    }
    await this.tenantDb.deleteFrom(airlines, eq(airlines.id, id));
    this.logger.info({ airlineId: id }, "airline.deleted");
  }
}
```

- [ ] **Step 6: Write the controller**

```ts
// apps/api/src/airlines/airlines.controller.ts
import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../auth/roles.decorator";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import {
  createAirlineSchema, updateAirlineSchema,
  type CreateAirlineInput, type UpdateAirlineInput, type AirlineDto,
} from "@cometkit/shared";
import { AirlinesService } from "./airlines.service";
import { toAirlineDto } from "./airlines.policy";

@Controller("airlines")
@UseGuards(JwtAuthGuard, RolesGuard)
export class AirlinesController {
  constructor(private readonly service: AirlinesService) {}

  @Get()
  async list(): Promise<AirlineDto[]> {
    return (await this.service.list()).map(toAirlineDto);
  }

  @Post()
  @Roles("admin")
  async create(@Body(new ZodValidationPipe(createAirlineSchema)) input: CreateAirlineInput): Promise<AirlineDto> {
    return toAirlineDto(await this.service.create(input));
  }

  @Patch(":id")
  @Roles("admin")
  async update(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateAirlineSchema)) input: UpdateAirlineInput,
  ): Promise<AirlineDto> {
    return toAirlineDto(await this.service.update(id, input));
  }

  @Delete(":id")
  @Roles("admin")
  async remove(@Param("id") id: string): Promise<{ ok: true }> {
    await this.service.remove(id);
    return { ok: true };
  }
}
```

- [ ] **Step 7: Write the module and register it**

```ts
// apps/api/src/airlines/airlines.module.ts
import { Module } from "@nestjs/common";
import { AirlinesController } from "./airlines.controller";
import { AirlinesService } from "./airlines.service";

@Module({
  controllers: [AirlinesController],
  providers: [AirlinesService],
  exports: [AirlinesService],
})
export class AirlinesModule {}
```

In `apps/api/src/app.module.ts`: add `import { AirlinesModule } from "./airlines/airlines.module";` with the other imports, and add `AirlinesModule,` to the `imports` array (after `CategoriesModule,`).

- [ ] **Step 8: Verify unit specs + typecheck**

Run: `cd apps/api && bun run vitest run src/airlines/airlines.policy.spec.ts && bun run typecheck`
Expected: policy PASS. Typecheck will still error in `packages.service.ts` / `search.service.ts` (fixed in Tasks 7-8) — that's expected; confirm no NEW errors inside `src/airlines`.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/airlines apps/api/src/app.module.ts
git commit -m "feat(api): airlines CRUD module with name-conflict and delete guard"
```

---

### Task 6: Departure-cities API module

**Files:**
- Create: `apps/api/src/departure-cities/departure-cities.policy.ts`, `.service.ts`, `.controller.ts`, `.module.ts`, `.policy.spec.ts`
- Modify: `apps/api/src/app.module.ts` (register `DepartureCitiesModule`)

**Interfaces:**
- Produces: `DepartureCitiesService` (same method set as `AirlinesService` but over `departureCities` + `packages.departureCityId`); `normalizeDepartureCityName`, `toDepartureCityDto`; REST at `/departure-cities`.

- [ ] **Step 1: Write the failing policy test**

Mirror Task 5 Step 1 in `apps/api/src/departure-cities/departure-cities.policy.spec.ts`, importing `normalizeDepartureCityName`, `toDepartureCityDto`, using name `"Jakarta"`.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && bun run vitest run src/departure-cities/departure-cities.policy.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write policy / service / controller / module**

Copy Task 5's four source files into `apps/api/src/departure-cities/`, replacing verbatim:
- symbol `Airline` → `DepartureCity`, `airline` → `departureCity`
- table `airlines` → `departureCities`, `packages.airlineId` → `packages.departureCityId`
- controller path `"airlines"` → `"departure-cities"`
- schemas `createAirlineSchema`/`updateAirlineSchema` → `createDepartureCitySchema`/`updateDepartureCitySchema`
- DTO `AirlineDto` → `DepartureCityDto`, log events `airline.*` → `departureCity.*`
- conflict message `An airline named` → `A departure city named`, `in use by ... deactivate` message → `Departure city is in use by ...`

Register in `apps/api/src/app.module.ts`: import `DepartureCitiesModule` and add `DepartureCitiesModule,` after `AirlinesModule,`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && bun run vitest run src/departure-cities/departure-cities.policy.spec.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/departure-cities apps/api/src/app.module.ts
git commit -m "feat(api): departure-cities CRUD module"
```

---

### Task 7: Packages service — FK mapping, publish gating, DTO names

**Files:**
- Modify: `apps/api/src/packages/packages.service.ts`, `apps/api/src/packages/packages.policy.ts`
- Test: `apps/api/src/packages/packages.policy.spec.ts`

**Interfaces:**
- Consumes: `airlines`, `departureCities` tables; `PackageDto` new fields.
- Produces: create/update persist `airlineId` / `departureCityId` with tenant-ownership validation; `findOne` resolves `airlineName` / `departureCityName` via lookup; publish gating checks the ids.

- [ ] **Step 1: Update the publish policy test (Red)**

In `apps/api/src/packages/packages.policy.spec.ts`, update fixtures: replace `airline: "X"` / `departureCity: "Y"` with `airlineId: "a1", airlineName: "X", departureCityId: "c1", departureCityName: "Y"`, and add a case asserting that a missing `airlineId` yields an `"airline"` error and missing `departureCityId` yields `"departureCity"`.

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/api && bun run vitest run src/packages/packages.policy.spec.ts`
Expected: FAIL (policy still reads `pkg.airline`).

- [ ] **Step 3: Update `packages.policy.ts`**

Replace the airline / departureCity checks:
```ts
    if (!pkg.airlineId) {
      errors.push("airline");
    }
    if (!pkg.departureCityId) {
      errors.push("departureCity");
    }
```

- [ ] **Step 4: Update `packages.service.ts` writes**

Add imports: `airlines, departureCities` to the `@cometkit/db` import.

In `create()`: replace `airline: input.airline ?? null,` / `departureCity: input.departureCity ?? null,` with:
```ts
        airlineId: input.airlineId ?? null,
        departureCityId: input.departureCityId ?? null,
```
Before the insert, after the category scope check, validate ownership:
```ts
    if (input.airlineId) await this.assertAirlineOwned(input.airlineId);
    if (input.departureCityId) await this.assertDepartureCityOwned(input.departureCityId);
```

In `update()`: the `updateData = { ...input }` spread already forwards `airlineId` / `departureCityId`. After computing `effectiveCategoryId`, add ownership validation:
```ts
    if (input.airlineId) await this.assertAirlineOwned(input.airlineId);
    if (input.departureCityId) await this.assertDepartureCityOwned(input.departureCityId);
```

Add the two private helpers next to `assertCategoryScope`:
```ts
  private async assertAirlineOwned(airlineId: string): Promise<void> {
    const [row] = await this.tenantDb.select(airlines, eq(airlines.id, airlineId));
    if (!row) throw new BadRequestException("airline");
  }

  private async assertDepartureCityOwned(departureCityId: string): Promise<void> {
    const [row] = await this.tenantDb.select(departureCities, eq(departureCities.id, departureCityId));
    if (!row) throw new BadRequestException("departureCity");
  }
```

- [ ] **Step 5: Resolve names in `findOne()` and fix the return shape**

After the `categoryName` lookup block, add:
```ts
    let airlineName: string | null = null;
    if (pkg.airlineId) {
      const [a] = await this.db
        .select({ name: airlines.name })
        .from(airlines)
        .where(and(eq(airlines.tenantId, this.tenantDb.tenantId), eq(airlines.id, pkg.airlineId)))
        .limit(1);
      airlineName = a?.name ?? null;
    }
    let departureCityName: string | null = null;
    if (pkg.departureCityId) {
      const [c] = await this.db
        .select({ name: departureCities.name })
        .from(departureCities)
        .where(and(eq(departureCities.tenantId, this.tenantDb.tenantId), eq(departureCities.id, pkg.departureCityId)))
        .limit(1);
      departureCityName = c?.name ?? null;
    }
```
The `return { ...pkg, ... }` spread carries `airlineId` / `departureCityId` from the row; add the resolved names to the returned object:
```ts
      airlineName,
      departureCityName,
```

- [ ] **Step 6: Run policy test + typecheck the packages area**

Run: `cd apps/api && bun run vitest run src/packages/packages.policy.spec.ts && bun run typecheck`
Expected: policy PASS; typecheck errors now only remain in `search.service.ts` (Task 8).

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/packages
git commit -m "feat(api): packages persist airline/city FKs, resolve names, gate publish"
```

---

### Task 8: Search — join master tables

**Files:**
- Modify: `apps/api/src/search/search.service.ts`

**Interfaces:**
- Consumes: `airlines`, `departure_cities` tables (raw SQL joins).
- Produces: airline / departure-city filters match the joined master-row name; result payload's `airline` is the joined airline name. `SearchResultDto` shape is unchanged (still exposes `airline` string).

- [ ] **Step 1: Update the filter predicates**

In the `filters` SQL, replace:
```sql
      and (${params.airline ?? null}::text is null or p.airline = ${params.airline ?? null})
      and (${params.departureCity ?? null}::text is null or p.departure_city = ${params.departureCity ?? null})
```
with:
```sql
      and (${params.airline ?? null}::text is null or la.name = ${params.airline ?? null})
      and (${params.departureCity ?? null}::text is null or dca.name = ${params.departureCity ?? null})
```

- [ ] **Step 2: Add the joins and swap the select**

In the main `rowsResult` query, change `p.airline` in the select list to `la.name as airline`, and add the two joins after `left join package_categories pc on pc.id = p.category_id`:
```sql
      left join airlines la on la.id = p.airline_id
      left join departure_cities dca on dca.id = p.departure_city_id
```
Add the **same two joins** to the `countResult` query (it currently joins providers + `depLateral`; add both master joins so the `dca.name` / `la.name` filter references resolve there too).

- [ ] **Step 3: Verify typecheck + full unit suite**

Run: `cd apps/api && bun run typecheck && bun run vitest run`
Expected: PASS (no remaining `p.airline` references; `SearchRow.airline` still string).

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/search/search.service.ts
git commit -m "feat(api): search joins airline/city master tables for filter and name"
```

---

### Task 9: Seed — starter master rows for the demo tenant

**Files:**
- Modify: `packages/db/src/seed.ts`

**Interfaces:**
- Produces: demo-tenant `airlines` / `departure_cities` rows; the demo package references them by id.

- [ ] **Step 1: Insert starter rows before the demo package block**

Just before the demo package `existingPackage` lookup, add (uses the already-imported `and`, `eq`, `ulid`, `schema`):

```ts
    const STARTER_AIRLINES = [
      "Garuda Indonesia", "Saudia", "Lion Air", "Citilink", "Batik Air", "Saudi Arabian Airlines",
    ];
    const STARTER_CITIES = [
      "Jakarta", "Surabaya", "Medan", "Makassar", "Solo", "Balikpapan",
    ];
    for (const name of STARTER_AIRLINES) {
      await db.insert(schema.airlines)
        .values({ id: ulid(), tenantId: tenant.id, name, isActive: true })
        .onConflictDoNothing();
    }
    for (const name of STARTER_CITIES) {
      await db.insert(schema.departureCities)
        .values({ id: ulid(), tenantId: tenant.id, name, isActive: true })
        .onConflictDoNothing();
    }
    const [demoAirline] = await db.select({ id: schema.airlines.id }).from(schema.airlines)
      .where(and(eq(schema.airlines.tenantId, tenant.id), eq(schema.airlines.name, "Saudi Arabian Airlines")));
    const [demoCity] = await db.select({ id: schema.departureCities.id }).from(schema.departureCities)
      .where(and(eq(schema.departureCities.tenantId, tenant.id), eq(schema.departureCities.name, "Jakarta")));
```

Note: the `onConflictDoNothing()` above relies on the normalized-name unique index; if a raw `.values` conflict target is required by drizzle, use `.onConflictDoNothing()` with no target (the partial unique index still enforces at the DB).

- [ ] **Step 2: Point the demo package at the ids**

In the demo package `.values({...})`, replace:
```ts
        airline: "Saudi Arabian Airlines",
        flightRoute: "CGK-JED-CGK",
        departureCity: "Jakarta",
```
with:
```ts
        airlineId: demoAirline?.id,
        flightRoute: "CGK-JED-CGK",
        departureCityId: demoCity?.id,
```

- [ ] **Step 3: Migrate then seed**

Run: `cd packages/db && bun run db:migrate && bun run db:seed`
Expected: both complete; no error. (If already migrated in Task 4, `db:migrate` is a no-op.)

- [ ] **Step 4: Commit**

```bash
git add packages/db/src/seed.ts
git commit -m "feat(db): seed starter airlines/cities for demo tenant"
```

---

### Task 10: Web hooks

**Files:**
- Create: `apps/web/src/hooks/use-airlines.ts`, `apps/web/src/hooks/use-departure-cities.ts`

**Interfaces:**
- Produces: `useAirlines()`, `useCreateAirline()`, `useUpdateAirline()`, `useDeleteAirline()` and the departure-cities equivalents; query keys `["airlines"]` / `["departure-cities"]`.

- [ ] **Step 1: Write `use-airlines.ts`**

Copy the structure of `apps/web/src/hooks/use-categories.ts`, but: no params on the list query (`enabled` always), resource `"airlines"`, types `AirlineDto` / `CreateAirlineInput` / `UpdateAirlineInput`:

```ts
"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AirlineDto, CreateAirlineInput, UpdateAirlineInput } from "@cometkit/shared";
import { api } from "@/lib/api";

export const airlinesKeys = { all: ["airlines"] as const };

export function useAirlines() {
  return useQuery<AirlineDto[]>({
    queryKey: airlinesKeys.all,
    queryFn: () => api.get("airlines").json<AirlineDto[]>(),
  });
}
export function useCreateAirline() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateAirlineInput) => api.post("airlines", { json: input }).json<AirlineDto>(),
    onSuccess: () => qc.invalidateQueries({ queryKey: airlinesKeys.all }),
  });
}
export function useUpdateAirline() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: UpdateAirlineInput & { id: string }) =>
      api.patch(`airlines/${id}`, { json: input }).json<AirlineDto>(),
    onSuccess: () => qc.invalidateQueries({ queryKey: airlinesKeys.all }),
  });
}
export function useDeleteAirline() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`airlines/${id}`).json<{ ok: true }>(),
    onSuccess: () => qc.invalidateQueries({ queryKey: airlinesKeys.all }),
  });
}
```

- [ ] **Step 2: Write `use-departure-cities.ts`**

Same as Step 1 with resource `"departure-cities"`, key `["departure-cities"]`, types `DepartureCityDto` / `CreateDepartureCityInput` / `UpdateDepartureCityInput`, exported hook names `useDepartureCities` / `useCreateDepartureCity` / `useUpdateDepartureCity` / `useDeleteDepartureCity`.

- [ ] **Step 3: Typecheck web**

Run: `cd apps/web && bun run typecheck`
Expected: PASS for the new hooks (form/search errors handled in Tasks 12-13).

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/hooks/use-airlines.ts apps/web/src/hooks/use-departure-cities.ts
git commit -m "feat(web): airline & departure-city query hooks"
```

---

### Task 11: Web admin — master-data section under Settings

**Files:**
- Create: `apps/web/src/app/dashboard/settings/master-data/page.tsx`
- Modify: `apps/web/src/app/dashboard/settings/page.tsx` (add a "Master data" link next to Templates)

**Interfaces:**
- Consumes: the Task 10 hooks.
- Produces: an admin-only page listing airlines and departure cities with add / rename / activate-toggle / delete, reusing one generic list section for both.

- [ ] **Step 1: Add the nav link**

In `settings/page.tsx` header actions, add before the Templates link:
```tsx
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard/settings/master-data">Master data</Link>
          </Button>
```

- [ ] **Step 2: Write the master-data page**

Create `apps/web/src/app/dashboard/settings/master-data/page.tsx` — an admin-guarded page (copy the `me.role !== "admin"` guard block and the `role="alert"` error banner from `templates/page.tsx`) with two `MasterList` sections. Each section: a create input + button, and a list where each row shows the name (editable via inline input on an "Edit" toggle), an Active/Inactive toggle button (calls update with `{ isActive: !row.isActive }`), and a Delete button; all mutations wrapped in try/catch surfacing `readApiError(err)` into the banner.

```tsx
"use client";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useMe } from "@/hooks/use-auth";
import {
  useAirlines, useCreateAirline, useUpdateAirline, useDeleteAirline,
} from "@/hooks/use-airlines";
import {
  useDepartureCities, useCreateDepartureCity, useUpdateDepartureCity, useDeleteDepartureCity,
} from "@/hooks/use-departure-cities";
import { readApiError } from "@/lib/api";

interface Row { id: string; name: string; isActive: boolean; }
interface MasterListProps {
  title: string;
  rows: Row[] | undefined;
  onCreate: (name: string) => Promise<void>;
  onRename: (id: string, name: string) => Promise<void>;
  onToggle: (id: string, isActive: boolean) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onError: (msg: string) => void;
}

function MasterList({ title, rows, onCreate, onRename, onToggle, onDelete, onError }: MasterListProps) {
  const [newName, setNewName] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const guard = async (fn: () => Promise<void>) => {
    try { await fn(); } catch (err) { onError(await readApiError(err)); }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>Manage the {title.toLowerCase()} available in the package form.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder={`Add ${title.toLowerCase()}`} />
          <Button
            type="button"
            onClick={() => guard(async () => { if (newName.trim()) { await onCreate(newName.trim()); setNewName(""); } })}
          >
            Add
          </Button>
        </div>
        <ul className="divide-y">
          {(rows ?? []).map((r) => (
            <li key={r.id} className="flex items-center gap-2 py-2">
              {editId === r.id ? (
                <Input value={editName} onChange={(e) => setEditName(e.target.value)} className="flex-1" />
              ) : (
                <span className={`flex-1 text-sm ${r.isActive ? "" : "text-muted-foreground line-through"}`}>{r.name}</span>
              )}
              {editId === r.id ? (
                <Button type="button" variant="outline" size="sm"
                  onClick={() => guard(async () => { await onRename(r.id, editName.trim()); setEditId(null); })}>
                  Save
                </Button>
              ) : (
                <Button type="button" variant="ghost" size="sm"
                  onClick={() => { setEditId(r.id); setEditName(r.name); }}>
                  Edit
                </Button>
              )}
              <Button type="button" variant="ghost" size="sm"
                onClick={() => guard(() => onToggle(r.id, !r.isActive))}>
                {r.isActive ? "Deactivate" : "Activate"}
              </Button>
              <Button type="button" variant="ghost" size="sm" className="text-destructive hover:bg-destructive/10"
                onClick={() => guard(() => onDelete(r.id))}>
                Delete
              </Button>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

export default function MasterDataPage() {
  const { data: me } = useMe();
  const [error, setError] = useState<string | null>(null);

  const airlines = useAirlines();
  const createAirline = useCreateAirline();
  const updateAirline = useUpdateAirline();
  const deleteAirline = useDeleteAirline();

  const cities = useDepartureCities();
  const createCity = useCreateDepartureCity();
  const updateCity = useUpdateDepartureCity();
  const deleteCity = useDeleteDepartureCity();

  if (me && me.role !== "admin") {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3 px-6">
        <span className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">admin required</span>
        <p className="text-sm text-muted-foreground">Master-data management requires an admin account.</p>
        <Button asChild variant="outline" size="sm"><Link href="/dashboard">Back to dashboard</Link></Button>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-12">
      <header className="flex items-center justify-between mb-8">
        <div className="space-y-1">
          <span className="font-mono text-xs uppercase tracking-[0.22em] text-muted-foreground">admin · settings · master data</span>
          <h1 className="text-2xl font-bold tracking-tight">Airlines & Departure Cities</h1>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm"><Link href="/dashboard/settings">Settings</Link></Button>
          <Button asChild variant="outline" size="sm"><Link href="/dashboard">Dashboard</Link></Button>
        </div>
      </header>

      {error && (
        <div role="alert" className="mb-6 rounded-md bg-destructive/10 p-3 text-sm text-destructive font-medium">{error}</div>
      )}

      <div className="space-y-8">
        <MasterList
          title="Airlines"
          rows={airlines.data}
          onCreate={(name) => createAirline.mutateAsync({ name }).then(() => setError(null))}
          onRename={(id, name) => updateAirline.mutateAsync({ id, name }).then(() => setError(null))}
          onToggle={(id, isActive) => updateAirline.mutateAsync({ id, isActive }).then(() => setError(null))}
          onDelete={(id) => deleteAirline.mutateAsync(id).then(() => setError(null))}
          onError={setError}
        />
        <MasterList
          title="Departure Cities"
          rows={cities.data}
          onCreate={(name) => createCity.mutateAsync({ name }).then(() => setError(null))}
          onRename={(id, name) => updateCity.mutateAsync({ id, name }).then(() => setError(null))}
          onToggle={(id, isActive) => updateCity.mutateAsync({ id, isActive }).then(() => setError(null))}
          onDelete={(id) => deleteCity.mutateAsync(id).then(() => setError(null))}
          onError={setError}
        />
      </div>
    </main>
  );
}
```

- [ ] **Step 3: Typecheck web**

Run: `cd apps/web && bun run typecheck`
Expected: PASS for the new page + settings link.

- [ ] **Step 4: Commit**

```bash
git add "apps/web/src/app/dashboard/settings/master-data/page.tsx" "apps/web/src/app/dashboard/settings/page.tsx"
git commit -m "feat(web): master-data admin section for airlines & departure cities"
```

---

### Task 12: Create-package form — dropdowns

**Files:**
- Modify: `apps/web/src/app/dashboard/packages/[id]/page.tsx`

**Interfaces:**
- Consumes: `useAirlines`, `useDepartureCities`, `PackageDto` new fields.
- Produces: airline & departure-city `<select>` dropdowns bound to ids; keep-assigned-when-editing behavior; payload sends ids.

- [ ] **Step 1: Swap the state**

Replace `const [airline, setAirline] = useState("");` and `const [departureCity, setDepartureCity] = useState("");` with:
```tsx
  const [airlineId, setAirlineId] = useState("");
  const [departureCityId, setDepartureCityId] = useState("");
```
Add near the other hooks: `const { data: airlinesList } = useAirlines();` and `const { data: departureCitiesList } = useDepartureCities();` (import both hooks at the top).

- [ ] **Step 2: Load from the package**

In the `if (pkg) {` effect, replace `setAirline(pkg.airline || "");` / `setDepartureCity(pkg.departureCity || "");` with:
```tsx
      setAirlineId(pkg.airlineId ?? "");
      setDepartureCityId(pkg.departureCityId ?? "");
```

- [ ] **Step 3: Build option lists with assigned-preservation**

After `selectableProviders`, add:
```tsx
  const airlineOptions = (airlinesList ?? []).filter((a) => a.isActive || a.id === airlineId);
  const departureCityOptions = (departureCitiesList ?? []).filter((c) => c.isActive || c.id === departureCityId);
```

- [ ] **Step 4: Swap the inputs for selects**

Replace the Airline `<Input>` block with:
```tsx
                    <Label htmlFor="airline">Airline</Label>
                    <select
                      id="airline"
                      value={airlineId}
                      onChange={(e) => setAirlineId(e.target.value)}
                      disabled={!isAdmin}
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <option value="">— Select airline —</option>
                      {airlineOptions.map((a) => (
                        <option key={a.id} value={a.id}>{a.name}{a.isActive ? "" : " (inactive)"}</option>
                      ))}
                    </select>
```
Replace the Departure City `<Input>` block the same way (id `departureCity`, `departureCityId`, `setDepartureCityId`, `departureCityOptions`, label "Departure City").

- [ ] **Step 5: Update the payload**

In `handleFormSubmit`'s `payload`, replace `airline: airline.trim() || null,` / `departureCity: departureCity.trim() || null,` with:
```tsx
      airlineId: airlineId || null,
      departureCityId: departureCityId || null,
```

- [ ] **Step 6: Typecheck web**

Run: `cd apps/web && bun run typecheck`
Expected: PASS (no `airline` / `departureCity` string references remain in this file).

- [ ] **Step 7: Commit**

```bash
git add "apps/web/src/app/dashboard/packages/[id]/page.tsx"
git commit -m "feat(web): airline & departure-city dropdowns on package form"
```

---

### Task 13: Search UI — read names (no free-text field change)

**Files:**
- Inspect/Modify: `apps/web/src/app/dashboard/search/search-filters.tsx`, `apps/web/src/app/dashboard/search/result-card.tsx`

**Interfaces:**
- Consumes: `SearchResultDto.airline` (still the airline name via join).

- [ ] **Step 1: Confirm no code change needed for result card**

`result-card.tsx` reads `dto.airline` — still a string. No change. The search filter inputs (`local.airline`, `local.departureCity`) remain free-text name matches (non-goal to dropdownize). Verify by reading both files; only touch them if a type error appears.

- [ ] **Step 2: Typecheck web (full)**

Run: `cd apps/web && bun run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit (only if a file changed)**

```bash
git add apps/web/src/app/dashboard/search
git commit -m "chore(web): confirm search reads airline name from joined DTO"
```
If nothing changed, skip this commit.

---

### Task 14: API integration tests

**Files:**
- Create: `apps/api/src/airlines/airlines.service.int.spec.ts`
- Modify: `apps/api/src/packages/packages.service.int.spec.ts` (assign + publish gating)

**Interfaces:**
- Consumes: the running Postgres (`bun run test:int`).

- [ ] **Step 1: Write the airlines integration spec**

Model it on `apps/api/src/users/users.service.int.spec.ts` / `categories.service.int.spec.ts` (same bootstrap + row cleanup). Cover: create airline; duplicate normalized name → `ConflictException`; delete unreferenced → ok; create a package referencing the airline, then delete airline → `ConflictException` (in-use guard).

- [ ] **Step 2: Extend the packages integration spec**

Add: create a draft with an `airlineId` + `departureCityId`; publish succeeds when both + category + Makkah hotel + active provider present; publish is rejected (BadRequest naming `airline` / `departureCity`) when either id is missing.

- [ ] **Step 3: Run integration tests**

Run: `cd apps/api && bun run test:int`
Expected: PASS (new + existing). If failures, load `systematic-debugging` before fixing.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/airlines/airlines.service.int.spec.ts apps/api/src/packages/packages.service.int.spec.ts
git commit -m "test(api): integration coverage for master-data CRUD, guard, publish gating"
```

---

### Task 15: Full verify

- [ ] **Step 1: Run the quality gate**

Run: `bun run verify` (repo root) then `cd apps/api && bun run test:int`
Expected: typecheck + lint + unit + integration all PASS.

- [ ] **Step 2: Manual smoke (per acceptance scenarios)**

Run `bun run dev`, then: Settings → Master data (add/rename/deactivate an airline; delete a referenced one is rejected); create a package (airline/city dropdowns show active rows; publish blocked until both chosen); editing a package whose airline was deactivated still shows it selected; search by an airline name returns the package with the name on the card.

- [ ] **Step 3: Commit any fixes, then this plan is complete.**

## Self-Review

- **Spec coverage:** Master tables + unique/isActive (Task 3); admin-only CRUD (Tasks 5-6, 11); active-filtering + assigned-preservation (Task 12); delete guard (Tasks 5-6, 14); starter seed demo-only + backfill-all + blank→null + case/whitespace collapse (Tasks 4, 9); package FK + publish gating (Tasks 2, 7); search over master by name (Task 8). All requirements mapped.
- **Placeholder scan:** none — every code step shows full code; the one "copy with renames" step (Task 6 Step 3) enumerates every substitution.
- **Type consistency:** `airlineId`/`departureCityId` (ids) and `airlineName`/`departureCityName` (DTO) used consistently; `SearchResultDto.airline` stays a string sourced from `la.name`; hook/type names match across Tasks 10-12.
