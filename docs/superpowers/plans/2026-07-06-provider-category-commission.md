---
change: provider-category-commission
design-doc: docs/superpowers/specs/2026-07-06-provider-category-commission-design.md
base-ref: a1db2b5ac43c9f5be098d380ebcf6f5c0bd255a2
---

# Provider Category Commission Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the fixed `packages.category` enum with admin-defined `package_categories` scoped by `(tenant, provider, productType)`, moving commission from the provider default to the category (provider default becomes the seed), and repointing packages to a nullable `categoryId` FK.

**Architecture:** New `package_categories` table + nullable `packages.category_id` FK. Admin-guarded categories Nest module surfaced under providers (CRUD + commission, delete-guard, uniqueness `409`). Packages/search services read via join; the create-package form and provider page get category UI; search filters by category name. Migration follows the existing `dedup-providers` pattern: additive migration → idempotent TS backfill runner → cutover migration that drops the enum column. The `category` column is kept alongside `category_id` through the middle tasks so every commit compiles; it is removed only in the final cutover task.

**Tech Stack:** Bun, TypeScript 6 (nodenext), Drizzle ORM + Postgres, NestJS + nestjs-pino, Zod 4, Next.js + TanStack Query + ky, Vitest.

## Global Constraints

- Run tooling with bun on PATH: `export PATH="/c/Users/rahma/.bun/bin:$PATH"` before bun/bunx/openspec. Run `.ts` scripts with `bun file.ts` (tsx loader is broken here).
- Wire shapes (Zod request schemas + response interfaces) live in `packages/shared`; persisted columns/row types live in `packages/db`. Dependency direction `shared ← db ← api`, `shared ← web`. Never reverse.
- Contract↔persistence compatibility is enforced by typed mappers (e.g. `toCategoryDto`). No drizzle-zod.
- Enums shared by both live in `packages/shared`; the Drizzle `pgEnum` derives from them. Reuse `COMMISSION_TYPES` and `PRODUCT_TYPES` — do NOT add new enum types for commission/product type.
- API errors: throw Nest `HttpException` subclasses; never try/catch to shape errors in controllers. Validation via `ZodValidationPipe` with a shared schema on every body/query.
- Services log domain events: `this.logger.info({ ... }, "noun.verb")`. Never log commission secrets beyond ids where avoidable.
- RBAC: protect category writes with `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles("admin")`. Ownership/scope decisions are pure functions in `*.policy.ts`.
- Zod 4 idioms (`z.email()`, `z.enum`, `ZodType`); under Vitest use `import * as z from "zod"`.
- New runtime imports must be declared in that package's `package.json` (bun isolated linker won't hoist).
- ULID ids via `packages/db` `columns.ts` helpers; timestamps via `timestamps`.
- Always `db:migrate` before `db:seed`. Nest route order: static segments before parameterized.
- `bun run verify` (typecheck + lint + test) is the gate; it must pass at the end of every task.

---

### Task 1: `package_categories` schema + nullable `packages.category_id` (additive migration)

**Files:**
- Modify: `packages/db/src/schema/packages.ts`
- Modify: `packages/db/src/schema/index.ts` (export new table/types if the barrel lists tables explicitly — verify)
- Generate: `packages/db/drizzle/00NN_*.sql` (additive)

**Interfaces:**
- Produces: `package_categories` table with `{ id, tenantId, providerId, productType, name, commissionType, commissionValue, createdAt, updatedAt }`; `DbPackageCategory` / `NewDbPackageCategory` types; `packages.categoryId` (nullable `char(26)`).

- [ ] **Step 1: Add the table and FK column to the schema**

In `packages/db/src/schema/packages.ts`, import `commissionTypeEnum` from `./providers` and add, after the existing enums/table imports:

```typescript
import { commissionTypeEnum } from "./providers";
```

Add the new table (place it after `packages` and before `packageHotels`), and add the nullable FK to `packages`:

```typescript
export const packageCategories = pgTable("package_categories", {
  id: ulidPk(),
  ...tenantOwned(),
  providerId: ulidRef("provider_id")
    .notNull()
    .references(() => providers.id),
  productType: productTypeEnum("product_type").notNull().default("umrah"),
  name: varchar("name", { length: 120 }).notNull(),
  commissionType: commissionTypeEnum("commission_type").notNull().default("flat_per_pax"),
  commissionValue: integer("commission_value").notNull().default(0),
  ...timestamps,
}, (table) => [
  // Per-(tenant, provider, productType) uniqueness on the normalized name,
  // mirroring the providers normalized-name idiom.
  uniqueIndex("package_categories_scope_name_idx")
    .on(table.tenantId, table.providerId, table.productType, sql`lower(btrim(${table.name}))`),
  index("package_categories_provider_idx").on(table.providerId),
]);

export type DbPackageCategory = typeof packageCategories.$inferSelect;
export type NewDbPackageCategory = typeof packageCategories.$inferInsert;
```

Add `categoryId` to the `packages` table definition (keep the existing `category` enum column for now):

```typescript
  categoryId: ulidRef("category_id").references(() => packageCategories.id),
```

Add the needed imports to the top of the file: `uniqueIndex`, `sql`:

```typescript
import { boolean, integer, pgEnum, pgTable, text, varchar, primaryKey, unique, index, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
```

Note: `packageCategories` is declared after `packages`, but `packages.categoryId.references(() => packageCategories.id)` uses a thunk, so forward reference is fine.

- [ ] **Step 2: Confirm the barrel exports the new symbols**

Check `packages/db/src/schema/index.ts` (and `packages/db/src/index.ts`). If it re-exports `./schema/packages` with `export *`, no change is needed. If tables are listed explicitly, add `packageCategories`, `DbPackageCategory`, `NewDbPackageCategory`. Verify with:

Run: `export PATH="/c/Users/rahma/.bun/bin:$PATH"; grep -n "packageHotels\|packages" packages/db/src/schema/index.ts packages/db/src/index.ts`
Expected: shows how existing package symbols are exported; mirror that for the new ones.

- [ ] **Step 3: Generate the additive migration**

Run: `export PATH="/c/Users/rahma/.bun/bin:$PATH"; cd packages/db && bun run db:generate`
Expected: a new `drizzle/00NN_*.sql` that CREATEs `package_categories` and ADDs `packages.category_id` (nullable), with the unique + provider indexes. It must NOT drop `category`.

- [ ] **Step 4: Typecheck**

Run: `export PATH="/c/Users/rahma/.bun/bin:$PATH"; bun run verify`
Expected: PASS (purely additive; no consumers changed yet).

- [ ] **Step 5: Commit**

```bash
git add packages/db/src/schema/packages.ts packages/db/src/schema/index.ts packages/db/drizzle
git commit -m "feat(db): add package_categories table and nullable packages.category_id"
```

---

### Task 2: Shared category contracts + `LEGACY_CATEGORY_NAMES` + package schema `categoryId`

**Files:**
- Create: `packages/shared/src/categories.ts`
- Modify: `packages/shared/src/packages.ts`
- Modify: `packages/shared/src/index.ts` (export `./categories`)
- Test: `packages/shared/src/categories.spec.ts`

**Interfaces:**
- Produces: `LEGACY_CATEGORY_NAMES`; `createCategorySchema`, `updateCategorySchema`, `CreateCategoryInput`, `UpdateCategoryInput`; `CategoryDto` (admin, with commission), `StaffCategoryDto` (no commission). `createPackageSchema`/`updatePackageSchema` gain optional `categoryId`; `publishPackageSchema` requires `categoryId`; `PackageDto` gains `categoryId: string | null` and `categoryName: string | null`.

- [ ] **Step 1: Write the failing test**

Create `packages/shared/src/categories.spec.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { createCategorySchema, LEGACY_CATEGORY_NAMES } from "./categories";

describe("category schemas", () => {
  it("exposes the six legacy names for seeding", () => {
    expect(LEGACY_CATEGORY_NAMES).toEqual([
      "Regular", "Plus", "Private VIP", "Ramadan", "Arbain", "Other",
    ]);
  });

  it("accepts a valid category with commission", () => {
    const parsed = createCategorySchema.parse({
      providerId: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
      productType: "umrah",
      name: "VIP",
      commissionType: "flat_per_pax",
      commissionValue: 500000,
    });
    expect(parsed.name).toBe("VIP");
    expect(parsed.commissionValue).toBe(500000);
  });

  it("rejects an empty name", () => {
    expect(() =>
      createCategorySchema.parse({
        providerId: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
        productType: "umrah",
        name: "",
      }),
    ).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `export PATH="/c/Users/rahma/.bun/bin:$PATH"; cd packages/shared && bunx vitest run src/categories.spec.ts`
Expected: FAIL — cannot find module `./categories`.

- [ ] **Step 3: Create the categories contract**

Create `packages/shared/src/categories.ts`:

```typescript
import * as z from "zod";
import { COMMISSION_TYPES } from "./providers";
import { PRODUCT_TYPES } from "./packages";

/** Seed names bootstrapped per provider from the retired fixed category enum. */
export const LEGACY_CATEGORY_NAMES = [
  "Regular", "Plus", "Private VIP", "Ramadan", "Arbain", "Other",
] as const;

export const createCategorySchema = z.object({
  providerId: z.string().length(26),
  productType: z.enum(PRODUCT_TYPES).default("umrah"),
  name: z.string().min(1).max(120),
  commissionType: z.enum(COMMISSION_TYPES).optional(),
  commissionValue: z.number().int().nonnegative().optional(),
});

export const updateCategorySchema = z.object({
  name: z.string().min(1).max(120).optional(),
  commissionType: z.enum(COMMISSION_TYPES).optional(),
  commissionValue: z.number().int().nonnegative().optional(),
});

export type CreateCategoryInput = z.input<typeof createCategorySchema>;
export type UpdateCategoryInput = z.input<typeof updateCategorySchema>;

export interface CategoryDto {
  id: string;
  tenantId: string;
  providerId: string;
  productType: string;
  name: string;
  commissionType: string;
  commissionValue: number;
  createdAt: string;
  updatedAt: string;
}

/** Staff-safe projection: commission stripped. */
export type StaffCategoryDto = Omit<CategoryDto, "commissionType" | "commissionValue">;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `export PATH="/c/Users/rahma/.bun/bin:$PATH"; cd packages/shared && bunx vitest run src/categories.spec.ts`
Expected: PASS.

- [ ] **Step 5: Wire `categoryId` into package schemas + DTO**

In `packages/shared/src/packages.ts`:
- Add to `createPackageSchema` (keep `category` for now): `categoryId: z.string().length(26).nullable().optional(),`
- `publishPackageSchema`: add `categoryId: z.string().length(26),` and remove the `category` line (publish now keys on categoryId).
- In `PackageDto`, add: `categoryId: string | null;` and `categoryName: string | null;` (keep `category: string;` for now).
- Export categories from the barrel: in `packages/shared/src/index.ts` add `export * from "./categories";` (verify the barrel style first with `grep -n "export" packages/shared/src/index.ts`).

- [ ] **Step 6: Typecheck the whole repo**

Run: `export PATH="/c/Users/rahma/.bun/bin:$PATH"; bun run verify`
Expected: PASS (categoryId is additive/optional; publish now needs categoryId but no caller constructs publish bodies in shared/db). If the API publish path fails to typecheck, it is because `publishPackageSchema` dropped `category`; that is handled in Task 5 — if `bun run verify` is red here solely on the API publish controller/service referencing `category`, temporarily keep `category` optional in `publishPackageSchema` too and remove it in Task 5. Prefer keeping verify green: add `category: z.enum(PACKAGE_CATEGORIES).optional()` back to publish if needed, then tighten in Task 5.

- [ ] **Step 7: Commit**

```bash
git add packages/shared/src
git commit -m "feat(shared): add category contracts, LEGACY_CATEGORY_NAMES, package categoryId"
```

---

### Task 3: Category policy (pure functions) + unit spec

**Files:**
- Create: `apps/api/src/categories/categories.policy.ts`
- Test: `apps/api/src/categories/categories.policy.spec.ts`

**Interfaces:**
- Produces: `normalizeCategoryName(name: string): string`; `categoryMatchesScope(cat, providerId, productType): boolean`; `toCategoryDto(row): CategoryDto`; `toStaffCategoryDto(row): StaffCategoryDto`.

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/categories/categories.policy.spec.ts`:

```typescript
import { describe, it, expect } from "vitest";
import {
  normalizeCategoryName,
  categoryMatchesScope,
  toCategoryDto,
  toStaffCategoryDto,
} from "./categories.policy";
import type { DbPackageCategory } from "@cometkit/db";

const row: DbPackageCategory = {
  id: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
  tenantId: "01TENANT0000000000000000AA",
  providerId: "01PROV0000000000000000000A",
  productType: "umrah",
  name: "VIP",
  commissionType: "flat_per_pax",
  commissionValue: 500000,
  createdAt: new Date("2026-07-06T00:00:00Z"),
  updatedAt: new Date("2026-07-06T00:00:00Z"),
};

describe("categories.policy", () => {
  it("normalizes name (lowercased, trimmed)", () => {
    expect(normalizeCategoryName("  ViP ")).toBe("vip");
  });

  it("matches scope by provider + productType", () => {
    expect(categoryMatchesScope(row, "01PROV0000000000000000000A", "umrah")).toBe(true);
    expect(categoryMatchesScope(row, "01PROV0000000000000000000A", "haji_khusus")).toBe(false);
    expect(categoryMatchesScope(row, "01OTHER000000000000000000A", "umrah")).toBe(false);
  });

  it("admin DTO includes commission; staff DTO strips it", () => {
    const admin = toCategoryDto(row);
    expect(admin.commissionValue).toBe(500000);
    const staff = toStaffCategoryDto(row) as Record<string, unknown>;
    expect(staff.commissionType).toBeUndefined();
    expect(staff.commissionValue).toBeUndefined();
    expect(staff.name).toBe("VIP");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `export PATH="/c/Users/rahma/.bun/bin:$PATH"; cd apps/api && bunx vitest run src/categories/categories.policy.spec.ts`
Expected: FAIL — cannot find `./categories.policy`.

- [ ] **Step 3: Implement the policy**

Create `apps/api/src/categories/categories.policy.ts`:

```typescript
import type { DbPackageCategory } from "@cometkit/db";
import type { CategoryDto, StaffCategoryDto } from "@cometkit/shared";

export function normalizeCategoryName(name: string): string {
  return name.trim().toLowerCase();
}

export function categoryMatchesScope(
  cat: Pick<DbPackageCategory, "providerId" | "productType">,
  providerId: string,
  productType: string,
): boolean {
  return cat.providerId === providerId && cat.productType === productType;
}

export function toCategoryDto(row: DbPackageCategory): CategoryDto {
  return {
    id: row.id,
    tenantId: row.tenantId,
    providerId: row.providerId,
    productType: row.productType,
    name: row.name,
    commissionType: row.commissionType,
    commissionValue: row.commissionValue,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toStaffCategoryDto(row: DbPackageCategory): StaffCategoryDto {
  const dto: Record<string, unknown> = { ...toCategoryDto(row) };
  delete dto.commissionType;
  delete dto.commissionValue;
  return dto as unknown as StaffCategoryDto;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `export PATH="/c/Users/rahma/.bun/bin:$PATH"; cd apps/api && bunx vitest run src/categories/categories.policy.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/categories/categories.policy.ts apps/api/src/categories/categories.policy.spec.ts
git commit -m "feat(api): add categories policy (scope, normalize, DTO mappers)"
```

---

### Task 4: Categories service + controller + module (admin CRUD, uniqueness + delete guard)

**Files:**
- Create: `apps/api/src/categories/categories.service.ts`
- Create: `apps/api/src/categories/categories.controller.ts`
- Create: `apps/api/src/categories/categories.module.ts`
- Modify: `apps/api/src/app.module.ts` (register `CategoriesModule`)
- Test: `apps/api/src/categories/categories.service.int.spec.ts`

**Interfaces:**
- Consumes: `TenantScopedDb`, `ProvidersService` (or a raw provider read) for the commission seed; `packageCategories`, `packages`, `providers` tables; policy helpers from Task 3.
- Produces: `CategoriesService` with `list(providerId, productType?)`, `findById(id)`, `create(input)`, `update(id, input)`, `remove(id)`; `CategoriesController` at route `categories`.

- [ ] **Step 1: Write the failing integration test**

Create `apps/api/src/categories/categories.service.int.spec.ts` following the pattern in `apps/api/src/packages/packages.service.int.spec.ts` (same bootstrap/teardown; rows are self-cleaned). Cover:

```typescript
// Pseudocode-level checklist — implement with the repo's int-spec harness:
// 1. create() seeds commission from the provider default when omitted
//    → create provider with defaultCommissionType='flat_per_pax', defaultCommissionValue=500000;
//      create category { name: "VIP", productType: "umrah" } without commission;
//      expect stored commissionType/Value === provider default.
// 2. create() with explicit commission uses the explicit values.
// 3. duplicate normalized name in the same (provider, productType) → ConflictException (409).
// 4. same name under a different productType (or provider) is allowed.
// 5. remove() a category referenced by a package → ConflictException (409); category still exists.
// 6. remove() an unused category → succeeds.
// 7. list(providerId, "umrah") returns only that scope; tenant isolation holds.
```

- [ ] **Step 2: Run test to verify it fails**

Run: `export PATH="/c/Users/rahma/.bun/bin:$PATH"; cd apps/api && bun run test:int -- categories.service.int` (needs local Postgres; run `db:migrate` first)
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the service**

Create `apps/api/src/categories/categories.service.ts` (mirrors `ProvidersService` uniqueness idiom, `TenantScopedDb` for tenant-owned writes, raw `DB` only where a cross-table count is needed):

```typescript
import { Inject, Injectable, ConflictException, NotFoundException } from "@nestjs/common";
import { InjectPinoLogger, PinoLogger } from "nestjs-pino";
import { and, eq, ne, sql, type SQL } from "drizzle-orm";
import { ulid } from "ulid";
import {
  packageCategories,
  packages,
  providers,
  type DbPackageCategory,
  type Database,
} from "@cometkit/db";
import type { CreateCategoryInput, UpdateCategoryInput } from "@cometkit/shared";
import { TenantScopedDb } from "../tenancy/tenant-scoped-db";
import { DB } from "../database/database.module";
import { normalizeCategoryName } from "./categories.policy";

@Injectable()
export class CategoriesService {
  constructor(
    private readonly tenantDb: TenantScopedDb,
    @Inject(DB) private readonly db: Database,
    @InjectPinoLogger(CategoriesService.name)
    private readonly logger: PinoLogger,
  ) {}

  async list(providerId: string, productType?: string): Promise<DbPackageCategory[]> {
    const extra = productType
      ? (and(eq(packageCategories.providerId, providerId), eq(packageCategories.productType, productType as never)) as SQL)
      : eq(packageCategories.providerId, providerId);
    return (await this.tenantDb.select(packageCategories, extra)) as DbPackageCategory[];
  }

  async findById(id: string): Promise<DbPackageCategory | undefined> {
    const [row] = await this.tenantDb.select(packageCategories, eq(packageCategories.id, id));
    return row as DbPackageCategory | undefined;
  }

  private async assertNoNameConflict(
    providerId: string,
    productType: string,
    name: string,
    excludeId?: string,
  ): Promise<void> {
    const match = and(
      eq(packageCategories.providerId, providerId),
      eq(packageCategories.productType, productType as never),
      eq(sql`lower(btrim(${packageCategories.name}))`, normalizeCategoryName(name)),
    ) as SQL;
    const where = excludeId ? (and(ne(packageCategories.id, excludeId), match) as SQL) : match;
    const [existing] = await this.tenantDb.select(packageCategories, where);
    if (existing) {
      throw new ConflictException(
        `A category named "${name}" already exists for this provider and product type`,
      );
    }
  }

  async create(input: CreateCategoryInput): Promise<DbPackageCategory> {
    const productType = input.productType ?? "umrah";
    // Seed commission from the provider default when omitted.
    const [provider] = await this.tenantDb.select(providers, eq(providers.id, input.providerId));
    if (!provider) throw new NotFoundException("Provider not found");
    await this.assertNoNameConflict(input.providerId, productType, input.name);

    const [row] = await this.tenantDb.insertValues(packageCategories, {
      id: ulid(),
      providerId: input.providerId,
      productType,
      name: input.name,
      commissionType: input.commissionType ?? (provider as { defaultCommissionType: string }).defaultCommissionType,
      commissionValue: input.commissionValue ?? (provider as { defaultCommissionValue: number }).defaultCommissionValue,
    });
    this.logger.info({ categoryId: (row as DbPackageCategory).id, providerId: input.providerId }, "category.created");
    return row as DbPackageCategory;
  }

  async update(id: string, input: UpdateCategoryInput): Promise<DbPackageCategory> {
    const existing = await this.findById(id);
    if (!existing) throw new NotFoundException("Category not found");
    if (input.name && normalizeCategoryName(input.name) !== normalizeCategoryName(existing.name)) {
      await this.assertNoNameConflict(existing.providerId, existing.productType, input.name, id);
    }
    const [row] = await this.tenantDb.update(packageCategories, { ...input }, eq(packageCategories.id, id));
    if (!row) throw new NotFoundException("Category not found");
    this.logger.info({ categoryId: id }, "category.updated");
    return row as DbPackageCategory;
  }

  async remove(id: string): Promise<void> {
    const existing = await this.findById(id);
    if (!existing) throw new NotFoundException("Category not found");
    const inUse = await this.db.$count(packages, eq(packages.categoryId, id));
    if (inUse > 0) {
      throw new ConflictException(`Category is in use by ${inUse} package(s) and cannot be deleted`);
    }
    await this.tenantDb.deleteFrom(packageCategories, eq(packageCategories.id, id));
    this.logger.info({ categoryId: id }, "category.deleted");
  }
}
```

- [ ] **Step 4: Implement the controller (route order: static before parameterized)**

Create `apps/api/src/categories/categories.controller.ts`. List is readable by any authenticated user (staff-safe DTO); create/update/delete are `@Roles("admin")`:

```typescript
import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../auth/roles.decorator";
import { CurrentUser } from "../auth/current-user.decorator";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import {
  createCategorySchema, updateCategorySchema,
  type CreateCategoryInput, type UpdateCategoryInput,
  type AuthUser, type CategoryDto, type StaffCategoryDto,
} from "@cometkit/shared";
import { CategoriesService } from "./categories.service";
import { toCategoryDto, toStaffCategoryDto } from "./categories.policy";

@Controller("categories")
@UseGuards(JwtAuthGuard, RolesGuard)
export class CategoriesController {
  constructor(private readonly service: CategoriesService) {}

  @Get()
  async list(
    @CurrentUser() user: AuthUser,
    @Query("providerId") providerId: string,
    @Query("productType") productType?: string,
  ): Promise<(CategoryDto | StaffCategoryDto)[]> {
    const rows = await this.service.list(providerId, productType);
    return rows.map((r) => (user.role === "admin" ? toCategoryDto(r) : toStaffCategoryDto(r)));
  }

  @Post()
  @Roles("admin")
  async create(
    @Body(new ZodValidationPipe(createCategorySchema)) input: CreateCategoryInput,
  ): Promise<CategoryDto> {
    return toCategoryDto(await this.service.create(input));
  }

  @Patch(":id")
  @Roles("admin")
  async update(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateCategorySchema)) input: UpdateCategoryInput,
  ): Promise<CategoryDto> {
    return toCategoryDto(await this.service.update(id, input));
  }

  @Delete(":id")
  @Roles("admin")
  async remove(@Param("id") id: string): Promise<{ ok: true }> {
    await this.service.remove(id);
    return { ok: true };
  }
}
```

- [ ] **Step 5: Module + registration**

Create `apps/api/src/categories/categories.module.ts`:

```typescript
import { Module } from "@nestjs/common";
import { CategoriesController } from "./categories.controller";
import { CategoriesService } from "./categories.service";

@Module({
  controllers: [CategoriesController],
  providers: [CategoriesService],
  exports: [CategoriesService],
})
export class CategoriesModule {}
```

Register it in `apps/api/src/app.module.ts` (add `CategoriesModule` to the `imports` array — verify the existing import list and mirror it).

- [ ] **Step 6: Run integration + verify**

Run: `export PATH="/c/Users/rahma/.bun/bin:$PATH"; cd apps/api && bun run test:int -- categories.service.int`
Expected: PASS. Then `bun run verify` (from repo root) → PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/categories apps/api/src/app.module.ts
git commit -m "feat(api): categories CRUD module (admin-guarded, uniqueness + delete guard, commission seed)"
```

---

### Task 5: Packages service maps `categoryId` + scope validation; publish requires category

**Files:**
- Modify: `apps/api/src/packages/packages.service.ts`
- Modify: `apps/api/src/packages/packages.policy.ts`
- Modify: `apps/api/src/packages/packages.policy.spec.ts`
- Modify: `apps/api/src/packages/packages.service.int.spec.ts` (add category-scope + publish cases)

**Interfaces:**
- Consumes: `packageCategories` table, `CategoriesService.findById` (or a direct read), policy `categoryMatchesScope`.
- Produces: package create/update persist `categoryId`; `findOne` resolves `categoryName` via join; publish validation keys on `categoryId`.

- [ ] **Step 1: Update the publish policy test (Red)**

In `packages/api/src/packages/packages.policy.spec.ts`, change the category assertion to key on `categoryId`. Expected new behavior: `validatePublishReady` pushes `"category"` when `pkg.categoryId` is null. Update or add a test asserting a package with `categoryId: null` yields a `"category"` error and one with a set `categoryId` does not.

- [ ] **Step 2: Run it (Red)**

Run: `export PATH="/c/Users/rahma/.bun/bin:$PATH"; cd apps/api && bunx vitest run src/packages/packages.policy.spec.ts`
Expected: FAIL on the category assertion.

- [ ] **Step 3: Update the policy (Green)**

In `packages.policy.ts`, replace the `if (!pkg.category)` block with:

```typescript
    if (!pkg.categoryId) {
      errors.push("category");
    }
```

- [ ] **Step 4: Persist `categoryId` + validate scope in the service**

In `packages.service.ts`:
- `create`: set `categoryId: input.categoryId ?? null` (remove the `category: input.category ?? "regular"` line only in Task 9 cutover — for now set BOTH `categoryId` and keep `category` default via the column default; do not pass `category` explicitly if you keep the DB default). When `input.categoryId` is provided, load the category and throw `BadRequestException("category")` if `!categoryMatchesScope(cat, providerId, productType)`.
- `update`: when `input.categoryId` changes to a non-null value, apply the same scope validation.
- `findOne`: add a LEFT JOIN read for the category name. Simplest: after loading `pkg`, if `pkg.categoryId`, `select({ name }).from(packageCategories).where(eq(packageCategories.id, pkg.categoryId))`; set `categoryName = row?.name ?? null`. Return `categoryId: pkg.categoryId, categoryName` in the DTO (keep `category: pkg.category` until cutover).

Add a small private helper `assertCategoryScope(categoryId, providerId, productType)` that loads the category via `tenantDb.select(packageCategories, eq(...id))` and throws `BadRequestException("category")` on mismatch/not-found.

- [ ] **Step 5: Extend the integration spec**

In `packages.service.int.spec.ts` add: (a) publishing a package with `categoryId: null` is blocked with a `category` field error; (b) assigning a `categoryId` whose category belongs to another provider/productType is rejected; (c) a package with a valid in-scope `categoryId` publishes (given other fields valid).

- [ ] **Step 6: Run tests + verify**

Run: `export PATH="/c/Users/rahma/.bun/bin:$PATH"; cd apps/api && bunx vitest run src/packages/ && bun run test:int -- packages.service.int`
Then repo-root `bun run verify`.
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/packages
git commit -m "feat(api): packages persist categoryId with scope validation; publish requires category"
```

---

### Task 6: Search service joins categories + filters by category name

**Files:**
- Modify: `apps/api/src/search/search.service.ts`
- Modify: `packages/shared/src/search.ts` (category result may be null)
- Modify: `apps/api/src/search/search.service.int.spec.ts`

**Interfaces:**
- Produces: search reads `pc.name as category` via LEFT JOIN; the `category` filter matches `pc.name`.

- [ ] **Step 1: Update the raw SQL join + filter**

In `search.service.ts`:
- In the `filters` SQL, replace `and (${params.category ?? null}::text is null or p.category = ${params.category ?? null})` with a name match against the joined category:
  `and (${params.category ?? null}::text is null or pc.name = ${params.category ?? null})`
- In the main `select`, replace `p.category` with `pc.name as category`, and add `left join package_categories pc on pc.id = p.category_id` to the FROM/JOIN chain (place it alongside the existing provider join `pr`).
- In the row mapper, `category: r.category` becomes `category: r.category ?? null`.

- [ ] **Step 2: Allow null category in the search DTO**

In `packages/shared/src/search.ts`, change the result `category: string;` to `category: string | null;` (line ~62). Leave the `params.category` filter field as `z.string().optional()` — a free-text/name value now (drop the `z.enum(PACKAGE_CATEGORIES)` at line ~36; replace with `z.string().max(120).optional()`).

- [ ] **Step 3: Update / add the integration assertion**

In `search.service.int.spec.ts`, adjust any fixture that set `category: "regular"` to instead create a `package_categories` row (name e.g. "Regular") and set the package's `category_id`; assert filtering by category name returns the expected package. Follow the existing fixture/seed helper in that spec.

- [ ] **Step 4: Run + verify**

Run: `export PATH="/c/Users/rahma/.bun/bin:$PATH"; cd apps/api && bun run test:int -- search.service.int` then repo-root `bun run verify`.
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/search packages/shared/src/search.ts
git commit -m "feat(api): search joins package_categories and filters by category name"
```

---

### Task 7: Web — categories hook + provider-page management UI

**Files:**
- Create: `apps/web/src/hooks/use-categories.ts`
- Modify: `apps/web/src/app/dashboard/providers/[id]/page.tsx`

**Interfaces:**
- Consumes: shared `CategoryDto`, `CreateCategoryInput`, `UpdateCategoryInput`; the shared `api` ky instance.
- Produces: `useCategories(providerId, productType)`, `useCreateCategory()`, `useUpdateCategory()`, `useDeleteCategory()` with query key `["categories", providerId, productType]`; a category-management section on the provider page.

- [ ] **Step 1: Create the hook (mirror `use-users.ts`)**

Create `apps/web/src/hooks/use-categories.ts` following the `use-users.ts` structure: `categoriesKeys = { all: ["categories"], list: (providerId, productType) => ["categories", { providerId, productType }] }`. `useCategories` calls `api.get("categories", { searchParams: { providerId, productType } }).json<CategoryDto[]>()` with `enabled: !!providerId`. Mutations POST `categories`, PATCH `categories/${id}`, DELETE `categories/${id}`, each invalidating `categoriesKeys.all` on success.

- [ ] **Step 2: Add the management section to the provider page**

In `apps/web/src/app/dashboard/providers/[id]/page.tsx`, add an admin-only ("Commission Settings"-adjacent) card "Categories". For the provider being edited, group categories by product type (Phase 1: `umrah`). Each category row shows name + commission (type/value) editable inline; a "New category" control creates one with commission **prefilled from the provider default** (`defaultCommissionType`/`defaultCommissionValue` already in local state on this page). Wire create/update/delete to the hook. Surface the in-use delete `409` via `readApiError()` in a `role="alert"` block near the action. Copy: sentence case, buttons say what they do ("Add category", "Save", "Delete"). Match the existing shadcn/`select`/`Input` styling used elsewhere on the page.

- [ ] **Step 3: Typecheck + lint**

Run: `export PATH="/c/Users/rahma/.bun/bin:$PATH"; bun run verify`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/hooks/use-categories.ts "apps/web/src/app/dashboard/providers/[id]/page.tsx"
git commit -m "feat(web): category management on provider page + use-categories hook"
```

---

### Task 8: Web — package form category dropdown + search filter

**Files:**
- Modify: `apps/web/src/app/dashboard/packages/[id]/page.tsx`
- Modify: `apps/web/src/app/dashboard/search/search-filters.tsx`

**Interfaces:**
- Consumes: `useCategories` (Task 7).

- [ ] **Step 1: Replace the hardcoded category `<select>` in the package form**

In `apps/web/src/app/dashboard/packages/[id]/page.tsx`:
- Replace `const [category, setCategory] = useState("regular")` with `const [categoryId, setCategoryId] = useState<string>("")`.
- Load categories via `useCategories(providerId, productType)`; populate the `<select>` (lines ~425-439) with `categories.map(c => <option value={c.id}>{c.name}</option>)`, plus a leading empty "— Select category —" option (nullable). When the selected provider or product type changes, the hook refetches; if the current `categoryId` is not in the new list, reset it to "".
- On load of an existing package, set `categoryId` from `pkg.categoryId ?? ""`.
- In the submit payload (line ~158), send `categoryId: categoryId || null` instead of `category`.

- [ ] **Step 2: Update the search filter control**

In `apps/web/src/app/dashboard/search/search-filters.tsx`, replace the fixed category options with distinct category names. Since categories are per-provider, populate the name list from the tenant's categories: fetch via a lightweight call (e.g. reuse `useCategories` when a provider is chosen, otherwise a distinct-names source). Minimal approach for Phase 1: when a provider filter is selected, list that provider's category names; otherwise keep a free-text/select seeded from `LEGACY_CATEGORY_NAMES`. The filter value sent is the category **name** string (matches the Task 6 server filter).

- [ ] **Step 3: Typecheck + lint**

Run: `export PATH="/c/Users/rahma/.bun/bin:$PATH"; bun run verify`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add "apps/web/src/app/dashboard/packages/[id]/page.tsx" apps/web/src/app/dashboard/search/search-filters.tsx
git commit -m "feat(web): data-driven category dropdown in package form + search filter by name"
```

---

### Task 9: Backfill runner + seed update

**Files:**
- Create: `packages/db/src/scripts/backfill-categories.ts`
- Create: `packages/db/src/category-backfill-runner.ts`
- Modify: `packages/db/package.json` (add `db:backfill-categories` script)
- Modify: `packages/db/src/seed.ts`
- Test: `packages/db/src/scripts/backfill-categories.int.spec.ts` (or the repo's db int-spec location)

**Interfaces:**
- Produces: `backfillCategories(db): Promise<{ created: number; repointed: number }>` (idempotent); CLI runner; `db:backfill-categories` script.

- [ ] **Step 1: Write the failing integration test**

Create `backfill-categories.int.spec.ts` mirroring `apps/api/src/providers/dedup-providers.int.spec.ts` / the db int-spec harness. Assertions:
- Given a tenant with a provider (default commission `flat_per_pax`/500000) and packages having `category='regular'`, `category_id=null`: after `backfillCategories(db)`, a `package_categories` row `{name:'Regular', productType:'umrah', commissionType:'flat_per_pax', commissionValue:500000}` exists and every package has a non-null `category_id` pointing to it.
- The six `LEGACY_CATEGORY_NAMES` exist for that provider under `umrah`.
- Re-running `backfillCategories(db)` is a no-op (same counts; no duplicate rows).

- [ ] **Step 2: Run it (Red)**

Run: `export PATH="/c/Users/rahma/.bun/bin:$PATH"; cd packages/db && bun run db:migrate && bunx vitest run src/scripts/backfill-categories.int.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the backfill logic**

Create `packages/db/src/scripts/backfill-categories.ts`. Per tenant, in one transaction: (1) for each distinct `(provider_id, product_type, category)` in `packages` where `category_id is null`, upsert a category (name = legacy display for that enum value, commission seeded from the provider default) using `onConflictDoNothing` against the unique index; (2) seed the six `LEGACY_CATEGORY_NAMES` under `umrah` + any product type the provider has packages in, same seed commission; (3) `update packages set category_id = <matching category id>` by joining on `(provider_id, product_type, lower(btrim(name)) = lower(legacy display))`. Map legacy enum → display name via a local record: `{ regular:"Regular", plus:"Plus", private_vip:"Private VIP", ramadan:"Ramadan", arbain:"Arbain", other:"Other" }`. Log `{ event: "category.backfill.tenant", tenantId, created, repointed }` and a final count of packages still null (expected 0). Idempotent via `onConflictDoNothing` + `where category_id is null`.

Create `packages/db/src/category-backfill-runner.ts` mirroring `dedup-providers-runner.ts` (createDb → `backfillCategories(db)` → log → exit). Add to `packages/db/package.json` scripts: `"db:backfill-categories": "bun src/category-backfill-runner.ts"`.

- [ ] **Step 4: Update the seed**

In `packages/db/src/seed.ts`, before inserting demo packages, insert demo `package_categories` for the demo provider(s) under `umrah` (at least "Regular"), then set demo packages' `categoryId` to the matching category instead of `category: "regular"` (keep `category` too until cutover, or drop now if the column already has a default). Ensure seed remains idempotent (the recent seed idempotency fix pattern).

- [ ] **Step 5: Run the test + end-to-end**

Run: `export PATH="/c/Users/rahma/.bun/bin:$PATH"; cd packages/db && bunx vitest run src/scripts/backfill-categories.int.spec.ts && bun run db:migrate && bun src/category-backfill-runner.ts && bun run db:seed`
Expected: PASS; runner logs 0 packages with null category_id.

- [ ] **Step 6: Commit**

```bash
git add packages/db/src/scripts/backfill-categories.ts packages/db/src/category-backfill-runner.ts packages/db/src/scripts/backfill-categories.int.spec.ts packages/db/package.json packages/db/src/seed.ts
git commit -m "feat(db): idempotent category backfill runner + seed demo categories"
```

---

### Task 10: Cutover — drop the `category` enum column + remove all `category` references

**Files:**
- Modify: `packages/db/src/schema/packages.ts` (remove `category` column + `categoryEnum`)
- Modify: `packages/shared/src/packages.ts` (remove `PACKAGE_CATEGORIES`, `category` from schemas/DTO)
- Modify: `apps/api/src/packages/packages.service.ts` (stop reading/writing `category`)
- Modify: `apps/api/src/search/search.service.ts` (remove any lingering `p.category`)
- Modify: any remaining `category`-referencing spec/fixture (`packages/db/src/fixtures/search-benchmark.ts`, etc.)
- Generate: cutover migration dropping `category` + the `category` enum type

**Interfaces:**
- Produces: `category` fully removed; `categoryId`/`categoryName` are the only category surface.

- [ ] **Step 1: Find every remaining reference**

Run: `export PATH="/c/Users/rahma/.bun/bin:$PATH"; grep -rn "PACKAGE_CATEGORIES\|\.category\b\|category:" packages apps --include=*.ts --include=*.tsx | grep -v categoryId | grep -v categoryName | grep -v package_categories`
Expected: a finite list — resolve each (remove or switch to categoryId/categoryName).

- [ ] **Step 2: Remove from schema + shared**

- `packages/db/src/schema/packages.ts`: delete the `category: categoryEnum(...)` column and the `export const categoryEnum` (and its `PACKAGE_CATEGORIES` import).
- `packages/shared/src/packages.ts`: remove `PACKAGE_CATEGORIES`; remove `category` from `createPackageSchema`, `updatePackageSchema` (already using categoryId), any leftover in `publishPackageSchema`, and remove `category: string` from `PackageDto`.

- [ ] **Step 3: Remove from API + fixtures**

Delete the `category` field from `packages.service.ts` create/update/findOne DTO, and any `p.category` still in `search.service.ts`. Fix `packages/db/src/fixtures/search-benchmark.ts` and any spec still setting `category:` to use `categoryId`.

- [ ] **Step 4: Generate the cutover migration**

Run: `export PATH="/c/Users/rahma/.bun/bin:$PATH"; cd packages/db && bun run db:generate`
Expected: a migration that `ALTER TABLE packages DROP COLUMN category` and `DROP TYPE category`. Confirm it does NOT touch `category_id`.

- [ ] **Step 5: Full verify + end-to-end**

Run: `export PATH="/c/Users/rahma/.bun/bin:$PATH"; bun run verify` (repo root), then `cd packages/db && bun run db:migrate && bun src/category-backfill-runner.ts && bun run db:seed`, then `cd apps/api && bun run test:int`.
Expected: all PASS; no dangling `category` references (re-run the Step 1 grep → empty).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: drop legacy category enum, cut over to admin-defined categories"
```

---

## Self-Review

**Spec coverage:**
- New capability `provider-category-commission` — categories table + scope (T1), contracts (T2), CRUD/uniqueness/delete-guard/commission-seed (T3, T4), form filter (T8), admin-only staff strip (T3 mappers, T4 controller). ✓
- `package-catalog` — nullable categoryId + scope validation (T5), publish requires category (T5), draft-without-category (nullable column T1 + publish policy T5). ✓
- `provider-management` — provider default seeds category (T4 create), commission admin-only extended (T3/T4 staff DTO). ✓
- `package-search` — filter by category name via join (T6). ✓
- `user-management` — staff never receive category commission (T3 `toStaffCategoryDto`, T4 list mapping). ✓
- Migration (in-use combos + legacy seed + repoint, idempotent) — T9; cutover drop — T10. ✓

**Placeholder scan:** Web tasks (T7/T8) describe UI at a higher level than code blocks because they follow existing shadcn/hook patterns in named files; every other task carries concrete code. No "TBD"/"handle edge cases" placeholders.

**Type consistency:** `CategoryDto`/`StaffCategoryDto` (T2) consumed by mappers (T3) and controller (T4); `DbPackageCategory` (T1) consumed by service/policy; `categoryId`/`categoryName` (T2 `PackageDto`) produced by packages service (T5) and consumed by web (T8). `backfillCategories` return shape defined in T9 interfaces. Consistent.

**Verify-green ordering:** `category` is kept alongside `categoryId` through T1–T9 and removed only in T10, so each commit compiles and tests pass.
