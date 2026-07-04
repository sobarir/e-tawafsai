---
change: multi-tenancy-foundation
design-doc: docs/superpowers/specs/2026-07-04-multi-tenancy-foundation-design.md
base-ref: 2ac747b1e6f3f1cbac212ba2c6c6bb7a8fc138ad
---

# Multi-Tenancy Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make tenancy structural — every business row is tenant-owned, an unscoped query on a tenant-owned table is impossible by construction, and the active tenant is resolved per request — while the admin UX stays single-tenant.

**Architecture:** A `tenants` registry table plus a `tenantOwned()` column group adopted by `users`. A request-scoped tenant id lives in `nestjs-cls`; it is set by `JwtStrategy` for authenticated routes and by a host-resolution middleware for public routes. `TenantScopedDb` is the only data accessor for tenant-owned tables — it auto-filters reads, auto-stamps writes, and throws when no tenant context exists. Raw `DB` is reserved for migrations/seed and tenant-registry reads.

**Tech Stack:** NestJS 11 (Fastify adapter), Drizzle ORM 0.45 + postgres.js, Zod 4, `nestjs-cls`, Vitest 4, Next.js (web seam).

## Global Constraints

- Wire shapes (Zod request schemas, response interfaces) live in `packages/shared`; persisted column shapes live in `packages/db`. Never redeclare across the boundary. Dependency direction: `shared ← db ← api`, `shared ← web`. Never reverse.
- Enums shared by db + api live in `packages/shared` as `as const` tuples; Drizzle `pgEnum` derives from them.
- Zod 4 idioms only: `z.email()`, `z.enum(TUPLE)`, `z.flattenError`. Not v3 forms.
- TypeScript 6 base tsconfig: `module`/`moduleResolution: nodenext`. New runtime imports must be declared in that package's `package.json` (bun isolated linker does not hoist).
- ULID PKs are app-generated 26-char Crockford base32 via `ulidPk()` / `ulid()`; never DB-generated.
- Nest route order: static segments before parameterized. Throw `HttpException` subclasses; never shape errors in controllers (the global `AllExceptionsFilter` renders the one envelope). Validate every body/query with `ZodValidationPipe` + a shared schema.
- Services log domain events: `this.logger.info({ ... }, "noun.verb")`. Never log secrets; prefer ids over emails.
- `db:migrate` ALWAYS before `db:seed`. Seeding must be idempotent.
- A feature is not done until `bun run verify` (typecheck + lint + test) and `bun run test:int` pass.
- No global unique constraints on tenant-owned tables — uniqueness is composite with `tenantId`.
- The default tenant is resolved by its well-known slug `"default"`, never by a hardcoded id in application code.

---

## File Structure

**Created**
- `packages/shared/src/tenants.ts` — tenant enums, `TenantContext`/`TenantDto` types, `tenantInputSchema`.
- `packages/db/src/schema/tenants.ts` — `tenants` table + `tenantOwned()` helper (imports `tenants`, avoids a `columns.ts ↔ tenants` cycle).
- `apps/api/src/tenancy/tenant-context.ts` — CLS key + `TenantContextMissingError`.
- `apps/api/src/tenancy/tenant-scoped-db.ts` — `TenantScopedDb`.
- `apps/api/src/tenancy/tenant-scoped-db.spec.ts`
- `apps/api/src/tenancy/tenant-registry.service.ts` — unscoped tenant lookups by slug/id.
- `apps/api/src/tenancy/tenant-resolution.middleware.ts` — public host → tenant.
- `apps/api/src/tenancy/tenant-resolution.middleware.spec.ts`
- `apps/api/src/tenancy/tenancy.module.ts`
- `apps/api/src/tenancy/tenancy.int.spec.ts` — two-tenant isolation, loud failure, seed idempotency, stale-tenant token.
- `apps/web/middleware.ts` — subdomain → tenant slug seam.
- `apps/web/src/lib/tenant.ts` — `tenantSlugFromHost()`.

**Modified**
- `packages/shared/src/index.ts` — export `./tenants`.
- `packages/shared/src/auth.ts` — `AuthUser` gains `tenantId`.
- `packages/db/src/schema/users.ts` — `tenantOwned()`, `isPlatformOwner`, composite email unique.
- `packages/db/src/schema/index.ts` — export `./tenants`.
- `packages/db/src/seed.ts` — seed default tenant + attach users.
- `packages/db/drizzle/<generated>.sql` — hand-edited migration (backfill + composite unique).
- `apps/api/package.json` — add `nestjs-cls`.
- `apps/api/src/app.module.ts` — `ClsModule.forRoot(...)`, `TenancyModule`.
- `apps/api/src/database/database.module.ts` — export `TenantScopedDb` (or via TenancyModule).
- `apps/api/src/auth/jwt.strategy.ts` — payload `tenantId`; set CLS; scoped `findById`.
- `apps/api/src/auth/auth.service.ts` — scoped login; issue + return `tenantId`.
- `apps/api/src/auth/auth.service.spec.ts` — tenant in payload/response.
- `apps/api/src/users/users.service.ts` — use `TenantScopedDb`.
- `apps/api/src/users/users.service.int.spec.ts` — establish tenant context.
- `apps/web/src/lib/api.ts` — forward `X-Forwarded-Host`.

---

## Task 1: Shared tenant contracts

**Files:**
- Create: `packages/shared/src/tenants.ts`
- Test: `packages/shared/src/tenants.spec.ts`
- Modify: `packages/shared/src/index.ts`, `packages/shared/src/auth.ts`

**Interfaces:**
- Produces: `TENANT_TYPES`, `TENANT_PLANS`, `TENANT_PLAN_STATUSES` (`as const` tuples), `DEFAULT_TENANT_SLUG = "default"`, types `TenantType`/`TenantPlan`/`TenantPlanStatus`, `TenantContext`, `TenantDto`, `tenantInputSchema`, `TenantInput`. `AuthUser` gains `tenantId: string`.

- [x] **Step 1: Write the failing test**

```ts
// packages/shared/src/tenants.spec.ts
import { describe, expect, it } from "vitest";
import { tenantInputSchema, TENANT_TYPES, DEFAULT_TENANT_SLUG } from "./tenants";

const base = {
  name: "Tawafsai", slug: "default", tenantType: "agent" as const,
  plan: "subscription" as const, planStatus: "active" as const, brandName: "Tawafsai",
};

describe("tenantInputSchema", () => {
  it("accepts an agent + subscription tenant", () => {
    expect(tenantInputSchema.parse(base).slug).toBe("default");
  });
  it("rejects the ppiu seam value", () => {
    expect(tenantInputSchema.safeParse({ ...base, tenantType: "ppiu" }).success).toBe(false);
  });
  it("rejects the revenue_share seam value", () => {
    expect(tenantInputSchema.safeParse({ ...base, plan: "revenue_share" }).success).toBe(false);
  });
  it("rejects a non-kebab slug", () => {
    expect(tenantInputSchema.safeParse({ ...base, slug: "Not Kebab" }).success).toBe(false);
  });
  it("keeps the seam values defined in the tuple", () => {
    expect(TENANT_TYPES).toContain("ppiu");
    expect(DEFAULT_TENANT_SLUG).toBe("default");
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `cd packages/shared && bunx vitest run src/tenants.spec.ts`
Expected: FAIL — cannot find module `./tenants`.

- [x] **Step 3: Create the tenant contracts**

```ts
// packages/shared/src/tenants.ts
import { z } from "zod";

export const TENANT_TYPES = ["agent", "ppiu"] as const;
export type TenantType = (typeof TENANT_TYPES)[number];

export const TENANT_PLANS = ["subscription", "revenue_share"] as const;
export type TenantPlan = (typeof TENANT_PLANS)[number];

export const TENANT_PLAN_STATUSES = [
  "trialing", "active", "past_due", "suspended", "cancelled",
] as const;
export type TenantPlanStatus = (typeof TENANT_PLAN_STATUSES)[number];

/** Well-known slug for the single Phase-1 tenant; resolved by slug, never by a hardcoded id. */
export const DEFAULT_TENANT_SLUG = "default";

const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Tenant creation contract. Phase 1 accepts only agent + subscription;
 * the other enum values stay defined as schema seams (PRD D4/D5).
 */
export const tenantInputSchema = z
  .object({
    name: z.string().min(1).max(120),
    slug: z.string().min(1).max(63).regex(slugRegex, "slug must be kebab-case"),
    tenantType: z.enum(TENANT_TYPES),
    plan: z.enum(TENANT_PLANS),
    planStatus: z.enum(TENANT_PLAN_STATUSES).default("active"),
    brandName: z.string().min(1).max(120),
    brandLogoUrl: z.url().max(2048).nullable().default(null),
    waNumber: z.string().max(32).nullable().default(null),
    customDomain: z.string().max(255).nullable().default(null),
  })
  .refine((v) => v.tenantType === "agent", {
    path: ["tenantType"],
    message: "Only 'agent' tenants are supported in Phase 1",
  })
  .refine((v) => v.plan === "subscription", {
    path: ["plan"],
    message: "Only the 'subscription' plan is supported in Phase 1",
  });
export type TenantInput = z.infer<typeof tenantInputSchema>;

/** The resolved active tenant carried in request context. */
export interface TenantContext {
  id: string;
  slug: string;
  tenantType: TenantType;
  plan: TenantPlan;
  planStatus: TenantPlanStatus;
  brandName: string;
}

/** Wire representation of a tenant. */
export interface TenantDto extends TenantContext {
  name: string;
  brandLogoUrl: string | null;
  waNumber: string | null;
  customDomain: string | null;
  createdAt: string;
  updatedAt: string;
}
```

- [x] **Step 4: Export from the barrel and extend AuthUser**

In `packages/shared/src/index.ts` add after the `./auth` line:

```ts
export * from "./tenants";
```

In `packages/shared/src/auth.ts`, add `tenantId` to `AuthUser`:

```ts
export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
  tenantId: string;
}
```

- [x] **Step 5: Run test to verify it passes**

Run: `cd packages/shared && bunx vitest run src/tenants.spec.ts`
Expected: PASS (5 tests).

- [x] **Step 6: Commit**

```bash
git add packages/shared/src/tenants.ts packages/shared/src/tenants.spec.ts packages/shared/src/index.ts packages/shared/src/auth.ts
git commit -m "feat(shared): tenant enums, contracts, and tenantInputSchema seams"
```

---

## Task 2: `tenants` table + `tenantOwned()` helper

**Files:**
- Create: `packages/db/src/schema/tenants.ts`
- Modify: `packages/db/src/schema/index.ts`

**Interfaces:**
- Consumes: shared `TENANT_TYPES`/`TENANT_PLANS`/`TENANT_PLAN_STATUSES`; `ulidPk`/`ulidRef`/`timestamps` from `../columns`.
- Produces: `tenants` table, `Tenant`/`NewTenant` row types, `tenantTypeEnum`/`tenantPlanEnum`/`tenantPlanStatusEnum`, and `tenantOwned()` returning `{ tenantId }` (not-null FK → `tenants.id`).

- [x] **Step 1: Create the tenants schema**

```ts
// packages/db/src/schema/tenants.ts
import { boolean, pgEnum, pgTable, varchar } from "drizzle-orm/pg-core";
import {
  TENANT_PLAN_STATUSES,
  TENANT_PLANS,
  TENANT_TYPES,
} from "@cometkit/shared";
import { timestamps, ulidPk, ulidRef } from "../columns";

export const tenantTypeEnum = pgEnum("tenant_type", TENANT_TYPES);
export const tenantPlanEnum = pgEnum("tenant_plan", TENANT_PLANS);
export const tenantPlanStatusEnum = pgEnum("tenant_plan_status", TENANT_PLAN_STATUSES);

export const tenants = pgTable("tenants", {
  id: ulidPk(),
  name: varchar("name", { length: 120 }).notNull(),
  slug: varchar("slug", { length: 63 }).notNull().unique(),
  tenantType: tenantTypeEnum("tenant_type").notNull().default("agent"),
  plan: tenantPlanEnum("plan").notNull().default("subscription"),
  planStatus: tenantPlanStatusEnum("plan_status").notNull().default("active"),
  brandName: varchar("brand_name", { length: 120 }).notNull(),
  brandLogoUrl: varchar("brand_logo_url", { length: 2048 }),
  waNumber: varchar("wa_number", { length: 32 }),
  customDomain: varchar("custom_domain", { length: 255 }),
  ...timestamps,
});

export type Tenant = typeof tenants.$inferSelect;
export type NewTenant = typeof tenants.$inferInsert;

// `boolean` re-exported here so the users schema keeps one import site.
export { boolean };

/**
 * Column group every tenant-owned table spreads. Lives in the schema layer
 * (not columns.ts) because it references the tenants table — keeping it in
 * columns.ts would create a columns.ts <-> tenants import cycle.
 */
export const tenantOwned = () => ({
  tenantId: ulidRef("tenant_id")
    .notNull()
    .references(() => tenants.id),
});
```

- [x] **Step 2: Export from the schema barrel (order matters — tenants before users)**

Replace `packages/db/src/schema/index.ts` with:

```ts
export * from "./tenants";
export * from "./users";
```

- [x] **Step 3: Typecheck**

Run: `cd packages/db && bunx tsc --noEmit`
Expected: PASS (no references to `users` tenant column yet).

- [x] **Step 4: Commit**

```bash
git add packages/db/src/schema/tenants.ts packages/db/src/schema/index.ts
git commit -m "feat(db): tenants table and tenantOwned() column helper"
```

---

## Task 3: `users` becomes tenant-owned

**Files:**
- Modify: `packages/db/src/schema/users.ts`

**Interfaces:**
- Consumes: `tenantOwned` from `./tenants`.
- Produces: `users` with non-null `tenantId`, `isPlatformOwner` boolean, composite unique `(tenant_id, email)` (the global email unique is removed). `User`/`NewUser` types now include `tenantId` and `isPlatformOwner`.

- [x] **Step 1: Rewrite the users schema**

```ts
// packages/db/src/schema/users.ts
import { boolean, pgEnum, pgTable, uniqueIndex, varchar } from "drizzle-orm/pg-core";
import { USER_ROLES } from "@cometkit/shared";
import { timestamps, ulidPk } from "../columns";
import { tenantOwned } from "./tenants";

/** Role enum derives from the shared USER_ROLES tuple - one source of truth. */
export const userRoleEnum = pgEnum("user_role", USER_ROLES);

export const users = pgTable(
  "users",
  {
    id: ulidPk(),
    ...tenantOwned(),
    email: varchar("email", { length: 255 }).notNull(),
    passwordHash: varchar("password_hash", { length: 255 }).notNull(),
    name: varchar("name", { length: 120 }),
    role: userRoleEnum("role").notNull().default("user"),
    isPlatformOwner: boolean("is_platform_owner").notNull().default(false),
    ...timestamps,
  },
  (t) => [uniqueIndex("users_tenant_email_unique").on(t.tenantId, t.email)],
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
```

- [x] **Step 2: Typecheck**

Run: `cd packages/db && bunx tsc --noEmit`
Expected: PASS.

- [x] **Step 3: Commit**

```bash
git add packages/db/src/schema/users.ts
git commit -m "feat(db): users is tenant-owned with per-tenant email uniqueness and platform-owner seam"
```

---

## Task 4: Migration + seed

**Files:**
- Create: `packages/db/drizzle/<generated>.sql` (generated, then hand-edited)
- Modify: `packages/db/src/seed.ts`

**Interfaces:**
- Consumes: `DEFAULT_TENANT_SLUG`, `tenantInputSchema` from shared; `tenants`/`users` schema.
- Produces: a default tenant row (slug `"default"`) and demo users attached to it; both idempotent.

Requires a running local Postgres and repo-root `.env` with `DATABASE_URL`.

- [x] **Step 1: Generate the migration**

Run: `cd packages/db && bun run db:generate`
This emits a new file under `packages/db/drizzle/` creating `tenants`, its enums, adding `tenant_id`/`is_platform_owner` to `users`, dropping the old `users_email_unique`, and adding `users_tenant_email_unique`. Note the generated filename.

- [x] **Step 2: Hand-edit the generated SQL for safe backfill**

Drizzle's generated `ALTER TABLE "users" ADD COLUMN "tenant_id" ... NOT NULL` will fail on a DB that already has seeded users, and it inserts no default tenant. Edit the generated file so its body runs in this order (keep the enum/table CREATE statements drizzle generated; adjust the users ALTERs). The default tenant uses a fixed sentinel id so the backfill has a target; application code still resolves by slug.

```sql
-- (drizzle-generated CREATE TYPE ... and CREATE TABLE "tenants" ... stay as generated)

-- Seed the default tenant with a stable sentinel id (26-char ULID form).
-- Application code resolves this tenant by slug 'default', never by this id.
INSERT INTO "tenants" ("id","name","slug","tenant_type","plan","plan_status","brand_name")
VALUES ('00000000000000000000000000','Default Tenant','default','agent','subscription','active','Default Tenant')
ON CONFLICT ("slug") DO NOTHING;

-- users: add tenant_id nullable -> backfill -> enforce NOT NULL + FK.
ALTER TABLE "users" ADD COLUMN "tenant_id" char(26);
UPDATE "users" SET "tenant_id" = '00000000000000000000000000' WHERE "tenant_id" IS NULL;
ALTER TABLE "users" ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "users" ADD CONSTRAINT "users_tenant_id_tenants_id_fk"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id");

ALTER TABLE "users" ADD COLUMN "is_platform_owner" boolean DEFAULT false NOT NULL;

-- Swap global email unique for per-tenant composite unique.
DROP INDEX IF EXISTS "users_email_unique";
ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_email_unique";
CREATE UNIQUE INDEX "users_tenant_email_unique" ON "users" ("tenant_id","email");
```

> Note: the exact name of the dropped constraint/index may differ (`users_email_unique` vs `users_email_key`). Check `packages/db/drizzle/0000_*.sql` for the original name and match it. Data statements (INSERT/UPDATE) do not affect the drizzle snapshot, so leaving `meta/` untouched is correct.

- [x] **Step 3: Rewrite the seed to seed the default tenant first**

```ts
// packages/db/src/seed.ts
/**
 * Seed script - run AFTER `db:migrate`. Order matters: migrate, then seed.
 * Idempotent: re-running upserts the default tenant and demo accounts.
 */
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { ulid } from "ulid";
import { DEFAULT_TENANT_SLUG, tenantInputSchema } from "@cometkit/shared";
import { databaseUrl } from "../env";
import * as schema from "./schema";

const DEMO_ACCOUNTS = [
  { email: "admin@cometkit.dev", name: "Demo Admin", role: "admin" as const },
  { email: "demo@cometkit.dev", name: "Demo User", role: "user" as const },
];

async function main() {
  const client = postgres(databaseUrl, { max: 1 });
  const db = drizzle(client, { schema });

  // Default tenant: validated through the shared contract (proves seam rejection
  // path is real), upserted by its well-known slug.
  const tenantInput = tenantInputSchema.parse({
    name: "Default Tenant",
    slug: DEFAULT_TENANT_SLUG,
    tenantType: "agent",
    plan: "subscription",
    planStatus: "active",
    brandName: "Default Tenant",
  });

  await db
    .insert(schema.tenants)
    .values({ id: ulid(), ...tenantInput })
    .onConflictDoUpdate({
      target: schema.tenants.slug,
      set: { name: tenantInput.name, brandName: tenantInput.brandName },
    });

  const [tenant] = await db
    .select({ id: schema.tenants.id })
    .from(schema.tenants)
    .where(eq(schema.tenants.slug, DEFAULT_TENANT_SLUG));
  if (!tenant) throw new Error("Default tenant seed failed");

  const passwordHash = await bcrypt.hash("password123", 10);

  for (const account of DEMO_ACCOUNTS) {
    await db
      .insert(schema.users)
      .values({ id: ulid(), tenantId: tenant.id, passwordHash, ...account })
      .onConflictDoUpdate({
        target: [schema.users.tenantId, schema.users.email],
        set: { passwordHash, name: account.name, role: account.role },
      });
  }

  console.log(
    "Seed complete: default tenant + admin@cometkit.dev (admin), demo@cometkit.dev (user) / password123",
  );
  await client.end();
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
```

- [x] **Step 4: Apply and verify idempotency**

Run:
```bash
cd packages/db && bun run db:migrate && bun run db:seed && bun run db:seed
```
Expected: migrate applies cleanly; seed prints the completion line twice with no error. Verify exactly one default tenant:
```bash
psql "$DATABASE_URL" -c "select count(*) from tenants where slug='default'; select count(*) from users where tenant_id is null;"
```
Expected: tenant count `1`; null-tenant user count `0`.

> If migrate fails, load the `systematic-debugging` skill before editing — do not guess-patch the SQL.

- [x] **Step 5: Commit**

```bash
git add packages/db/drizzle packages/db/src/seed.ts
git commit -m "feat(db): migration backfills default tenant and per-tenant email unique; seed attaches users"
```

---

## Task 5: CLS tenant context

**Files:**
- Create: `apps/api/src/tenancy/tenant-context.ts`
- Modify: `apps/api/package.json`, `apps/api/src/app.module.ts`

**Interfaces:**
- Produces: `TENANT_ID_KEY` (CLS key string), `class TenantContextMissingError extends InternalServerErrorException`. `ClsModule` mounted globally so `ClsService` is injectable everywhere.

- [x] **Step 1: Add the dependency**

Resolve the current `nestjs-cls` version from npm (do not guess) and add it to `apps/api/package.json` dependencies, then install:

```bash
cd apps/api && bun add nestjs-cls
```

- [x] **Step 2: Create the context module file**

```ts
// apps/api/src/tenancy/tenant-context.ts
import { InternalServerErrorException } from "@nestjs/common";

/** CLS key under which the active tenant id is stored for a request. */
export const TENANT_ID_KEY = "tenantId";

/**
 * Thrown when a tenant-owned data access is attempted with no tenant context.
 * 500 (not 4xx): reaching the data layer without a resolved tenant is a
 * server-side wiring bug, never a client input error.
 */
export class TenantContextMissingError extends InternalServerErrorException {
  constructor() {
    super("Tenant context is required but was not established for this request");
  }
}
```

- [x] **Step 3: Mount ClsModule globally**

In `apps/api/src/app.module.ts` add the import and module entry:

```ts
import { ClsModule } from "nestjs-cls";
```

Add to the `imports` array (before `DatabaseModule`):

```ts
    ClsModule.forRoot({
      global: true,
      // Establish a CLS context per request. The tenant id is populated later
      // by JwtStrategy (authenticated) or TenantResolutionMiddleware (public).
      middleware: { mount: true },
    }),
```

- [x] **Step 4: Typecheck**

Run: `cd apps/api && bun run typecheck`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add apps/api/package.json apps/api/src/tenancy/tenant-context.ts apps/api/src/app.module.ts
git commit -m "feat(api): request-scoped tenant context via nestjs-cls"
```

---

## Task 6: `TenantScopedDb`

**Files:**
- Create: `apps/api/src/tenancy/tenant-scoped-db.ts`, `apps/api/src/tenancy/tenant-scoped-db.spec.ts`

**Interfaces:**
- Consumes: `DB` from `../database/database.module`; `ClsService`; `TENANT_ID_KEY`, `TenantContextMissingError`.
- Produces: `class TenantScopedDb` with `get tenantId(): string` (throws `TenantContextMissingError` when absent), `select(table, extraWhere?)`, `insertValues(values)`, `update(table, set, extraWhere?)`, `deleteFrom(table, extraWhere?)`, `count(table, extraWhere?)`. All operations require a tenant-owned table (has a `tenantId` column) and compose the tenant predicate with `and(...)`.

- [ ] **Step 1: Write the failing test (loud failure is the headline behavior)**

```ts
// apps/api/src/tenancy/tenant-scoped-db.spec.ts
import { describe, expect, it, vi } from "vitest";
import { ClsService } from "nestjs-cls";
import { TenantScopedDb } from "./tenant-scoped-db";
import { TenantContextMissingError } from "./tenant-context";

function clsWith(tenantId: string | undefined): ClsService {
  return { get: vi.fn().mockReturnValue(tenantId) } as unknown as ClsService;
}
const fakeDb = {} as never;

describe("TenantScopedDb", () => {
  it("throws when no tenant context is established", () => {
    const scoped = new TenantScopedDb(fakeDb, clsWith(undefined));
    expect(() => scoped.tenantId).toThrow(TenantContextMissingError);
  });

  it("returns the active tenant id when present", () => {
    const scoped = new TenantScopedDb(fakeDb, clsWith("01H..."));
    expect(scoped.tenantId).toBe("01H...");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && bunx vitest run src/tenancy/tenant-scoped-db.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `TenantScopedDb`**

```ts
// apps/api/src/tenancy/tenant-scoped-db.ts
import { Inject, Injectable } from "@nestjs/common";
import { ClsService } from "nestjs-cls";
import { and, eq, type SQL } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";
import type { Database } from "@cometkit/db";
import { DB } from "../database/database.module";
import { TENANT_ID_KEY, TenantContextMissingError } from "./tenant-context";

/** A table is tenant-owned when it carries a `tenantId` column. */
type TenantOwnedTable = PgTable & { tenantId: PgColumn };

/**
 * The ONLY data accessor for tenant-owned tables. Reads are filtered to the
 * active tenant; writes are stamped with it; every operation throws when no
 * tenant context exists. Raw `DB` is reserved for migrations/seed and
 * tenant-registry reads (the tenants table is not tenant-owned).
 */
@Injectable()
export class TenantScopedDb {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly cls: ClsService,
  ) {}

  /** Active tenant id; throws if the request established no tenant context. */
  get tenantId(): string {
    const id = this.cls.get<string | undefined>(TENANT_ID_KEY);
    if (!id) throw new TenantContextMissingError();
    return id;
  }

  private scope(table: TenantOwnedTable, extra?: SQL): SQL {
    const tenantPredicate = eq(table.tenantId, this.tenantId);
    return extra ? (and(tenantPredicate, extra) as SQL) : tenantPredicate;
  }

  select<T extends TenantOwnedTable>(table: T, extraWhere?: SQL) {
    return this.db.select().from(table as PgTable).where(this.scope(table, extraWhere));
  }

  count(table: TenantOwnedTable, extraWhere?: SQL): Promise<number> {
    return this.db.$count(table as PgTable, this.scope(table, extraWhere));
  }

  /** Insert into a tenant-owned table, stamping the active tenant id. */
  insertValues<T extends TenantOwnedTable>(
    table: T,
    values: Record<string, unknown>,
  ) {
    return this.db
      .insert(table as PgTable)
      .values({ ...values, tenantId: this.tenantId } as never)
      .returning();
  }

  update<T extends TenantOwnedTable>(
    table: T,
    set: Record<string, unknown>,
    extraWhere?: SQL,
  ) {
    return this.db
      .update(table as PgTable)
      .set(set as never)
      .where(this.scope(table, extraWhere))
      .returning();
  }

  deleteFrom<T extends TenantOwnedTable>(table: T, extraWhere?: SQL) {
    return this.db
      .delete(table as PgTable)
      .where(this.scope(table, extraWhere))
      .returning();
  }
}
```

> If Drizzle's generic types reject a call site during integration, keep the public method signatures and narrow the internal `as PgTable`/`as never` casts — the loud-failure and scoping behaviors are contract, the exact casts are implementation detail. Load `systematic-debugging` before reworking types.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && bunx vitest run src/tenancy/tenant-scoped-db.spec.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/tenancy/tenant-scoped-db.ts apps/api/src/tenancy/tenant-scoped-db.spec.ts
git commit -m "feat(api): TenantScopedDb - sole tenant-owned accessor with loud failure"
```

---

## Task 7: Tenant registry service

**Files:**
- Create: `apps/api/src/tenancy/tenant-registry.service.ts`

**Interfaces:**
- Consumes: `DB`; `tenants` table; `TenantContext` type.
- Produces: `class TenantRegistryService` with `findBySlug(slug): Promise<TenantContext | null>` and `findById(id): Promise<TenantContext | null>`. Reads the tenants registry with the raw unscoped `DB` (documented escape hatch — tenants is not tenant-owned).

- [ ] **Step 1: Implement the registry (unscoped by design)**

```ts
// apps/api/src/tenancy/tenant-registry.service.ts
import { Inject, Injectable } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { tenants, type Database, type Tenant } from "@cometkit/db";
import type { TenantContext } from "@cometkit/shared";
import { DB } from "../database/database.module";

function toContext(row: Tenant): TenantContext {
  return {
    id: row.id,
    slug: row.slug,
    tenantType: row.tenantType,
    plan: row.plan,
    planStatus: row.planStatus,
    brandName: row.brandName,
  };
}

/**
 * Reads the tenant registry. The `tenants` table is NOT tenant-owned (it is
 * the registry resolution consults to establish context), so it is accessed
 * through the raw unscoped DB by design.
 */
@Injectable()
export class TenantRegistryService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async findBySlug(slug: string): Promise<TenantContext | null> {
    const row = await this.db.query.tenants.findFirst({
      where: eq(tenants.slug, slug),
    });
    return row ? toContext(row) : null;
  }

  async findById(id: string): Promise<TenantContext | null> {
    const row = await this.db.query.tenants.findFirst({
      where: eq(tenants.id, id),
    });
    return row ? toContext(row) : null;
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/api && bun run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/tenancy/tenant-registry.service.ts
git commit -m "feat(api): tenant registry service (unscoped lookups by slug/id)"
```

---

## Task 8: Public host → tenant resolution

**Files:**
- Create: `apps/api/src/tenancy/tenant-resolution.middleware.ts`, `apps/api/src/tenancy/tenant-resolution.middleware.spec.ts`

**Interfaces:**
- Consumes: `TenantRegistryService`, `ClsService`, `TENANT_ID_KEY`, `DEFAULT_TENANT_SLUG`.
- Produces: `slugFromHost(host: string | undefined): string` (pure; apex/localhost → `"default"`, `{slug}.host` → slug) and `class TenantResolutionMiddleware implements NestMiddleware`. For requests WITHOUT an `authorization` header it resolves the host tenant into CLS or throws `NotFoundException` on an unknown slug. Requests WITH an `authorization` header are left for `JwtStrategy` to resolve.

- [ ] **Step 1: Write the failing test for the pure host parser**

```ts
// apps/api/src/tenancy/tenant-resolution.middleware.spec.ts
import { describe, expect, it } from "vitest";
import { slugFromHost } from "./tenant-resolution.middleware";

describe("slugFromHost", () => {
  it("maps apex domain to the default tenant", () => {
    expect(slugFromHost("tawafsai.com")).toBe("default");
  });
  it("maps localhost (and port) to the default tenant", () => {
    expect(slugFromHost("localhost:3001")).toBe("default");
  });
  it("extracts the subdomain slug", () => {
    expect(slugFromHost("hemat.tawafsai.com")).toBe("hemat");
  });
  it("extracts the slug from {slug}.localhost", () => {
    expect(slugFromHost("hemat.localhost:3001")).toBe("hemat");
  });
  it("treats www as the apex/default tenant", () => {
    expect(slugFromHost("www.tawafsai.com")).toBe("default");
  });
  it("falls back to default when host is undefined", () => {
    expect(slugFromHost(undefined)).toBe("default");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && bunx vitest run src/tenancy/tenant-resolution.middleware.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the parser and middleware**

```ts
// apps/api/src/tenancy/tenant-resolution.middleware.ts
import { Injectable, NestMiddleware, NotFoundException } from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";
import { ClsService } from "nestjs-cls";
import { DEFAULT_TENANT_SLUG } from "@cometkit/shared";
import { TENANT_ID_KEY } from "./tenant-context";
import { TenantRegistryService } from "./tenant-registry.service";

/**
 * Derive a tenant slug from a request host. Apex, `www`, and `localhost`
 * resolve to the default tenant; `{slug}.domain` resolves to `{slug}`.
 */
export function slugFromHost(host: string | undefined): string {
  if (!host) return DEFAULT_TENANT_SLUG;
  const hostname = host.split(":")[0].toLowerCase();
  const labels = hostname.split(".");
  // localhost / apex (example.com) / single label -> default
  if (hostname === "localhost" || labels.length < 3) {
    // `{slug}.localhost` is a 2-label host we still want to split.
    if (labels.length === 2 && labels[1] === "localhost") {
      return labels[0] === "www" ? DEFAULT_TENANT_SLUG : labels[0];
    }
    return DEFAULT_TENANT_SLUG;
  }
  const sub = labels[0];
  return sub === "www" ? DEFAULT_TENANT_SLUG : sub;
}

@Injectable()
export class TenantResolutionMiddleware implements NestMiddleware {
  constructor(
    private readonly registry: TenantRegistryService,
    private readonly cls: ClsService,
  ) {}

  async use(
    req: FastifyRequest["raw"] & { headers: Record<string, string | undefined> },
    _res: FastifyReply["raw"],
    next: (err?: unknown) => void,
  ): Promise<void> {
    // Authenticated requests resolve tenant from the JWT (JwtStrategy); leave them.
    if (req.headers["authorization"]) return next();

    const host = req.headers["x-forwarded-host"] ?? req.headers["host"];
    const slug = slugFromHost(host);
    const tenant = await this.registry.findBySlug(slug);
    if (!tenant) {
      return next(new NotFoundException("Unknown tenant"));
    }
    this.cls.set(TENANT_ID_KEY, tenant.id);
    return next();
  }
}
```

> Fastify note: Nest middleware receives the raw Node req/res under the Fastify adapter. Header access via `req.headers[...]` is correct. If CLS values set here are not visible in handlers (a known Fastify + middleware edge case), load `systematic-debugging`; the fallback is a `ClsGuard`-based setup — but verify with the Task 12 integration test first.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && bunx vitest run src/tenancy/tenant-resolution.middleware.spec.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/tenancy/tenant-resolution.middleware.ts apps/api/src/tenancy/tenant-resolution.middleware.spec.ts
git commit -m "feat(api): public host -> tenant resolution middleware"
```

---

## Task 9: Wire the tenancy module

**Files:**
- Create: `apps/api/src/tenancy/tenancy.module.ts`
- Modify: `apps/api/src/app.module.ts`

**Interfaces:**
- Produces: `TenancyModule` (global) providing/exporting `TenantScopedDb` and `TenantRegistryService`, and applying `TenantResolutionMiddleware` to all routes except `health`.

- [ ] **Step 1: Create the module**

```ts
// apps/api/src/tenancy/tenancy.module.ts
import {
  Global,
  MiddlewareConsumer,
  Module,
  NestModule,
  RequestMethod,
} from "@nestjs/common";
import { TenantRegistryService } from "./tenant-registry.service";
import { TenantScopedDb } from "./tenant-scoped-db";
import { TenantResolutionMiddleware } from "./tenant-resolution.middleware";

@Global()
@Module({
  providers: [TenantScopedDb, TenantRegistryService],
  exports: [TenantScopedDb, TenantRegistryService],
})
export class TenancyModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(TenantResolutionMiddleware)
      .exclude({ path: "health", method: RequestMethod.ALL })
      .forRoutes("*");
  }
}
```

- [ ] **Step 2: Register in AppModule (after ClsModule, DatabaseModule)**

In `apps/api/src/app.module.ts` import and add `TenancyModule` to `imports` immediately after `DatabaseModule`:

```ts
import { TenancyModule } from "./tenancy/tenancy.module";
// ...
    DatabaseModule,
    TenancyModule,
```

- [ ] **Step 3: Typecheck**

Run: `cd apps/api && bun run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/tenancy/tenancy.module.ts apps/api/src/app.module.ts
git commit -m "feat(api): TenancyModule wires scoped db, registry, and host resolution"
```

---

## Task 10: Auth carries the tenant

**Files:**
- Modify: `apps/api/src/auth/jwt.strategy.ts`, `apps/api/src/auth/auth.service.ts`, `apps/api/src/auth/auth.service.spec.ts`

**Interfaces:**
- Consumes: `ClsService`, `TENANT_ID_KEY`, `UsersService.findById`/`findByEmail` (now tenant-scoped).
- Produces: `JwtPayload` gains `tenantId: string`; `JwtStrategy.validate` sets CLS tenant from the payload before reading the user and returns `AuthUser` with `tenantId`; login/register issue tokens carrying `tenantId` and return it.

- [ ] **Step 1: Update JwtStrategy — set CLS tenant, return tenantId**

```ts
// apps/api/src/auth/jwt.strategy.ts
import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { ClsService } from "nestjs-cls";
import { ExtractJwt, Strategy } from "passport-jwt";
import type { AuthUser } from "@cometkit/shared";
import { UsersService } from "../users/users.service";
import { TENANT_ID_KEY } from "../tenancy/tenant-context";

export interface JwtPayload {
  sub: string;
  email: string;
  tenantId: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly users: UsersService,
    private readonly cls: ClsService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>("JWT_SECRET"),
    });
  }

  async validate(payload: JwtPayload): Promise<AuthUser> {
    // Establish tenant context BEFORE any tenant-owned read.
    this.cls.set(TENANT_ID_KEY, payload.tenantId);
    // Scoped by the active tenant: a user whose tenant changed resolves to
    // undefined -> 401 (same spirit as the existing role-freshness behavior).
    const user = await this.users.findById(payload.sub);
    if (!user) {
      throw new UnauthorizedException();
    }
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      tenantId: user.tenantId,
    };
  }
}
```

- [ ] **Step 2: Update AuthService — issue and return tenantId**

Edit `apps/api/src/auth/auth.service.ts`: in `toAuthResponse`, include `tenantId` on both the `AuthUser` and the `JwtPayload`:

```ts
  private toAuthResponse(user: User): AuthResponse {
    const authUser: AuthUser = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      tenantId: user.tenantId,
    };
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      tenantId: user.tenantId,
    };
    return {
      user: authUser,
      tokens: { accessToken: this.jwt.sign(payload) },
    };
  }
```

(`login`/`register` are unchanged in flow — they call `findByEmail`/`create`, which are now tenant-scoped by the host-resolved context established by the resolution middleware.)

- [ ] **Step 3: Update the auth spec to assert tenant propagation**

In `apps/api/src/auth/auth.service.spec.ts`, ensure the mocked user includes `tenantId` and assert the response/token carry it. Add a mock user field `tenantId: "01HTENANTAAAAAAAAAAAAAAAAA"` wherever a `User` is stubbed, and assert `result.user.tenantId` equals it. (Match the file's existing mocking style — mock `UsersService` at its boundary; no DB.)

- [ ] **Step 4: Run auth unit tests**

Run: `cd apps/api && bunx vitest run src/auth/auth.service.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/auth/jwt.strategy.ts apps/api/src/auth/auth.service.ts apps/api/src/auth/auth.service.spec.ts
git commit -m "feat(api): JWT and auth responses carry tenantId; validate sets tenant context"
```

---

## Task 11: Refactor UsersService onto TenantScopedDb

**Files:**
- Modify: `apps/api/src/users/users.service.ts`, `apps/api/src/users/users.service.int.spec.ts`

**Interfaces:**
- Consumes: `TenantScopedDb` (replaces the raw `DB` injection).
- Produces: all `users` reads/writes are tenant-scoped; behavior otherwise unchanged. `create` no longer needs a caller-supplied `tenantId` — the scoped db stamps it.

- [ ] **Step 1: Swap the injection and route queries through the scoped db**

Rewrite `apps/api/src/users/users.service.ts` so the constructor injects `TenantScopedDb` instead of `@Inject(DB)`, and each method uses the scoped helpers. Key changes (keep method signatures and logging identical):

```ts
import { Injectable, ConflictException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { InjectPinoLogger, PinoLogger } from "nestjs-pino";
import { desc, eq } from "drizzle-orm";
import { users, type NewUser, type User } from "@cometkit/db";
import type { /* unchanged DTO imports */ } from "@cometkit/shared";
import { hashPassword } from "../common/password";
import { TenantScopedDb } from "../tenancy/tenant-scoped-db";
import { buildPageMeta, canDeleteUser, toUserDto } from "./users.policy";

@Injectable()
export class UsersService {
  constructor(
    private readonly db: TenantScopedDb,
    @InjectPinoLogger(UsersService.name) private readonly logger: PinoLogger,
  ) {}

  async findByEmail(email: string): Promise<User | undefined> {
    const [row] = await this.db.select(users, eq(users.email, email));
    return row as User | undefined;
  }

  async findById(id: string): Promise<User | undefined> {
    const [row] = await this.db.select(users, eq(users.id, id));
    return row as User | undefined;
  }

  async create(data: Omit<NewUser, "tenantId">): Promise<User> {
    const [row] = await this.db.insertValues(users, data);
    if (!row) throw new Error("Insert returned no row");
    this.logger.info({ userId: (row as User).id, role: (row as User).role }, "user.created");
    return row as User;
  }

  async list(query: ListUsersQuery): Promise<Paginated<UserDto>> {
    const { page, limit } = query;
    const [rows, total] = await Promise.all([
      this.db.select(users).orderBy(desc(users.id)).limit(limit).offset((page - 1) * limit),
      this.db.count(users),
    ]);
    return { data: (rows as User[]).map(toUserDto), meta: buildPageMeta(page, limit, total) };
  }

  async createUser(input: CreateUserInput): Promise<UserDto> {
    if (await this.findByEmail(input.email)) {
      throw new ConflictException("An account with this email already exists");
    }
    const row = await this.create({
      email: input.email,
      passwordHash: await hashPassword(input.password),
      name: input.name ?? null,
      role: input.role,
    });
    return toUserDto(row);
  }

  async updateUser(id: string, input: UpdateUserInput): Promise<UserDto> {
    const [row] = await this.db.update(users, input, eq(users.id, id));
    if (!row) throw new NotFoundException("User not found");
    if (input.role) this.logger.info({ userId: id, role: input.role }, "user.role_changed");
    return toUserDto(row as User);
  }

  async deleteUser(actor: AuthUser, id: string): Promise<void> {
    if (!canDeleteUser(actor, id)) {
      throw new ForbiddenException("You cannot delete your own account");
    }
    const [row] = await this.db.deleteFrom(users, eq(users.id, id));
    if (!row) throw new NotFoundException("User not found");
    this.logger.info({ userId: id, actorId: actor.id }, "user.deleted");
  }

  async updateProfile(actorId: string, input: UpdateProfileInput): Promise<UserDto> {
    const [row] = await this.db.update(users, { name: input.name }, eq(users.id, actorId));
    if (!row) throw new NotFoundException("User not found");
    return toUserDto(row as User);
  }
}
```

> `this.db.select(users)` returns a Drizzle builder, so `.orderBy/.limit/.offset` still chain. Keep the exact DTO import list the file already had.

- [ ] **Step 2: Update the users integration spec to establish tenant context**

`apps/api/src/users/users.service.int.spec.ts` constructs `UsersService` directly. Provide a stub `TenantScopedDb` wired to the real `createDb(url)` and a fixed tenant id (the seeded default tenant, looked up by slug `default`). Concretely: in `beforeAll`, create the raw db, resolve the default tenant id, and build a `ClsService`-like stub whose `get(TENANT_ID_KEY)` returns that id; construct `new TenantScopedDb(rawDb, clsStub)` and pass it to `new UsersService(scoped, noopLogger)`. Clean up created rows as today.

- [ ] **Step 3: Run unit tests (int spec runs in Task 12)**

Run: `cd apps/api && bun run test`
Expected: PASS (users.policy, roles.guard, auth specs green; no DB).

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/users/users.service.ts apps/api/src/users/users.service.int.spec.ts
git commit -m "refactor(api): UsersService goes through TenantScopedDb"
```

---

## Task 12: Isolation integration tests (the C15 acceptance)

**Files:**
- Create: `apps/api/src/tenancy/tenancy.int.spec.ts`

**Interfaces:**
- Consumes: real Postgres via `createDb`; `TenantScopedDb`; `tenants`/`users` schema; `TENANT_ID_KEY`.

- [ ] **Step 1: Write the isolation + loud-failure integration spec**

```ts
// apps/api/src/tenancy/tenancy.int.spec.ts
import { config } from "dotenv";
import { resolve } from "node:path";
import { ulid } from "ulid";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import { createDb, tenants, users, type Database } from "@cometkit/db";
import { tenantInputSchema } from "@cometkit/shared";
import { TenantScopedDb } from "./tenant-scoped-db";
import { TENANT_ID_KEY, TenantContextMissingError } from "./tenant-context";

config({ path: resolve(__dirname, "../../../../.env") });

function clsStub(tenantId: string | undefined) {
  return { get: vi.fn().mockReturnValue(tenantId), set: vi.fn() } as never;
}

describe("tenant isolation (integration)", () => {
  let db: Database;
  const suffix = ulid().toLowerCase();
  const tenantIds: string[] = [];
  const email = `iso-${suffix}@cometkit.dev`; // identical email in both tenants

  beforeAll(async () => {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL required for integration tests");
    db = createDb(url);
    for (const slug of [`iso-a-${suffix}`, `iso-b-${suffix}`]) {
      const input = tenantInputSchema.parse({
        name: slug, slug, tenantType: "agent", plan: "subscription",
        planStatus: "active", brandName: slug,
      });
      const id = ulid();
      await db.insert(tenants).values({ id, ...input });
      tenantIds.push(id);
      // Each tenant gets a user with the SAME email — proves per-tenant uniqueness.
      const scoped = new TenantScopedDb(db, clsStub(id));
      await scoped.insertValues(users, {
        email, passwordHash: "x", name: slug, role: "user",
      });
    }
  });

  afterAll(async () => {
    await db.delete(users).where(inArray(users.tenantId, tenantIds));
    await db.delete(tenants).where(inArray(tenants.id, tenantIds));
  });

  it("returns only the active tenant's rows, zero foreign tenantId", async () => {
    const scopedA = new TenantScopedDb(db, clsStub(tenantIds[0]));
    const rows = await scopedA.select(users, eq(users.email, email));
    expect(rows).toHaveLength(1);
    expect(rows[0].tenantId).toBe(tenantIds[0]);
    expect(rows.some((r) => r.tenantId === tenantIds[1])).toBe(false);
  });

  it("permits identical emails across tenants (composite uniqueness)", async () => {
    const both = await db.select().from(users).where(eq(users.email, email));
    expect(both).toHaveLength(2);
  });

  it("fails loudly when no tenant context is established", async () => {
    const unscoped = new TenantScopedDb(db, clsStub(undefined));
    expect(() => unscoped.select(users)).toThrow(TenantContextMissingError);
  });

  it("has exactly one default tenant seeded", async () => {
    const def = await db.select().from(tenants).where(eq(tenants.slug, "default"));
    expect(def).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run the integration suite**

Run: `cd apps/api && bun run test:int`
Expected: PASS (this spec + the updated users int spec). Requires local Postgres migrated + seeded.

> Any failure here: load `systematic-debugging` and write a minimal failing case before touching source.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/tenancy/tenancy.int.spec.ts
git commit -m "test(api): two-tenant isolation, composite email, loud failure, default-tenant seed"
```

---

## Task 13: Web subdomain seam

**Files:**
- Create: `apps/web/middleware.ts`, `apps/web/src/lib/tenant.ts`
- Modify: `apps/web/src/lib/api.ts`

**Interfaces:**
- Produces: `tenantSlugFromHost(host: string | null): string` (mirrors the API parser); a Next middleware that reads the request host and sets an `x-tenant-slug` request header (no behavior change for the apex admin); the `api` ky instance forwards the browser host as `X-Forwarded-Host` so public API calls resolve to the right tenant.

- [ ] **Step 1: Add the host parser**

```ts
// apps/web/src/lib/tenant.ts
export const DEFAULT_TENANT_SLUG = "default";

/** Mirror of the API's slugFromHost: apex/www/localhost -> default. */
export function tenantSlugFromHost(host: string | null): string {
  if (!host) return DEFAULT_TENANT_SLUG;
  const hostname = host.split(":")[0].toLowerCase();
  const labels = hostname.split(".");
  if (labels.length === 2 && labels[1] === "localhost") {
    return labels[0] === "www" ? DEFAULT_TENANT_SLUG : labels[0];
  }
  if (hostname === "localhost" || labels.length < 3) return DEFAULT_TENANT_SLUG;
  const sub = labels[0];
  return sub === "www" ? DEFAULT_TENANT_SLUG : sub;
}
```

- [ ] **Step 2: Add the Next middleware seam**

```ts
// apps/web/middleware.ts
import { NextResponse, type NextRequest } from "next/server";
import { tenantSlugFromHost } from "./src/lib/tenant";

/**
 * Subdomain-aware tenant seam. Phase 1 admin runs on the apex/default host, so
 * this does not change behavior; it exposes the resolved slug for the future
 * public site and keeps host forwarding consistent.
 */
export function middleware(req: NextRequest) {
  const slug = tenantSlugFromHost(req.headers.get("host"));
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-tenant-slug", slug);
  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
```

- [ ] **Step 3: Forward the host from the ky client**

In `apps/web/src/lib/api.ts`, add a `beforeRequest` hook (alongside the existing bearer hook) that forwards the browser host so the API can resolve the tenant for public routes:

```ts
      ({ request }) => {
        if (typeof window !== "undefined") {
          request.headers.set("X-Forwarded-Host", window.location.host);
        }
      },
```

- [ ] **Step 4: Verify web typecheck/build**

Run: `cd apps/web && bun run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/middleware.ts apps/web/src/lib/tenant.ts apps/web/src/lib/api.ts
git commit -m "feat(web): subdomain tenant seam and host forwarding (admin UX unchanged)"
```

---

## Task 14: Stale-tenant token integration check + full gate

**Files:**
- Modify: `apps/api/src/tenancy/tenancy.int.spec.ts` (add one scenario)

**Interfaces:**
- Consumes: existing fixture from Task 12.

- [ ] **Step 1: Add the stale-tenant scenario**

Append to `tenancy.int.spec.ts`: create a user in tenant A, then simulate a token that claims tenant A while the user's row is moved to tenant B (`update users set tenant_id = B`). A scoped `findById` under tenant A's context (as `JwtStrategy` would set from the token's `tenantId`) must return no row — proving the fresh scoped re-read rejects a stale-tenant token.

```ts
  it("rejects a token whose tenantId no longer matches the user's tenant", async () => {
    const id = ulid();
    const scopedA = new TenantScopedDb(db, clsStub(tenantIds[0]));
    await scopedA.insertValues(users, {
      email: `stale-${suffix}@cometkit.dev`, passwordHash: "x", name: "stale", role: "user",
    });
    const [created] = await db.select().from(users)
      .where(and(eq(users.tenantId, tenantIds[0]), eq(users.email, `stale-${suffix}@cometkit.dev`)));
    // User reassigned to tenant B; a token still claiming tenant A must not resolve them.
    await db.update(users).set({ tenantId: tenantIds[1] }).where(eq(users.id, created.id));
    const stillInA = await scopedA.select(users, eq(users.id, created.id));
    expect(stillInA).toHaveLength(0);
  });
```

- [ ] **Step 2: Run the full quality gate**

Run:
```bash
cd /c/Sobari/Ai/tawaf-sai/e-tawafsai && bun run verify
cd apps/api && bun run test:int
```
Expected: `verify` (typecheck + lint + all unit tests) PASS; `test:int` PASS.

> If lint flags a raw `DB` injection on a tenant-owned table outside the escape-hatch list (tenant-registry, migrations/seed), that is the drift guard doing its job — route it through `TenantScopedDb`.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/tenancy/tenancy.int.spec.ts
git commit -m "test(api): stale-tenant token is rejected on fresh scoped re-read"
```

---

## Self-Review Notes

- **Spec coverage:** Tenant entity + seams (T1,T2,T4); default-tenant idempotent seed (T4,T12); mandatory tenant ownership + composite uniques (T3,T12); structural scoping + loud failure (T6,T12); tenant-scoped auth + stale token (T10,T14); tenant-prefixed storage — convention documented in the design (no upload feature ships now, so no task; revisit when file upload lands in a later change); subdomain resolution + apex/unknown/host-override (T8,T13, and T10 for authenticated override); two-tenant isolation fixture (T12).
- **Escape-hatch drift guard:** the design calls for a verify-time check. T14 relies on lint/review to catch raw `DB` on tenant-owned tables; if the repo has no such rule yet, add an ESLint `no-restricted-syntax` rule or a source-scan unit test as a follow-up — tracked here rather than silently skipped.
- **Fastify + CLS risk:** flagged in T5/T8; the earliest real signal is T12 (scoped reads inside the app). Keep the `ClsGuard` fallback in mind.
- **Types:** `TenantScopedDb` uses deliberate internal casts; public method names (`select`, `insertValues`, `update`, `deleteFrom`, `count`, `tenantId`) are stable and referenced consistently in T11/T12/T14.
