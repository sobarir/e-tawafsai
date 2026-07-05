# Departure & Inventory (C4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a departure schedule manager with atomic seat mutations, payment milestones, audit logs, and status automation.

**Architecture:** Add `departures` and `inventory_adjustments` tables with a Drizzle CHECK constraint, transaction-wrapped seat allotment adjustment APIs, a background cron transition job with read self-healing, and Next.js admin page components.

**Tech Stack:** Next.js, Fastify, NestJS, Drizzle ORM, Zod, TanStack Query.

## Global Constraints
- TypeScript 6 nodules resolved explicitly.
- Zod 4 schemas and validation.
- Concurrency-safe seat update checks.

---

### Task 1: Shared Schema Contracts & Validation

**Files:**
- Create: `packages/shared/src/departures.ts`
- Modify: `packages/shared/src/index.ts`
- Test: `packages/shared/src/departures.spec.ts`

**Interfaces:**
- Produces: `PaymentMilestone`, `CreateDepartureInput`, `UpdateDepartureInput`, `DepartureDto` interfaces.

- [x] **Step 1: Write the failing test**
  Create `packages/shared/src/departures.spec.ts` to validate departure payload constraints:
  ```ts
  import { describe, expect, it } from "vitest";
  import { createDepartureSchema } from "./departures";

  describe("Departure schema validation", () => {
    it("validates valid input", () => {
      const res = createDepartureSchema.safeParse({
        packageId: "01HGGGGGKKKKKQQQQQWWWWWRRR",
        departureType: "fixed_date",
        departureDate: "2026-08-15T00:00:00.000Z",
        returnDate: "2026-08-24T00:00:00.000Z",
        seatTotal: 45,
        currency: "IDR",
        priceQuad: 35000000,
        dpAmount: 5000000,
        paymentSchedule: [
          { name: "DP", amount: 5000000, daysBeforeDeparture: 60 }
        ],
      });
      expect(res.success).toBe(true);
    });

    it("rejects without quad price", () => {
      const res = createDepartureSchema.safeParse({
        packageId: "01HGGGGGKKKKKQQQQQWWWWWRRR",
        departureType: "fixed_date",
        departureDate: "2026-08-15T00:00:00.000Z",
        returnDate: "2026-08-24T00:00:00.000Z",
        seatTotal: 45,
        currency: "IDR",
        dpAmount: 5000000,
        paymentSchedule: [],
      });
      expect(res.success).toBe(false);
    });
  });
  ```

- [x] **Step 2: Run test to verify it fails**
  Run: `bun run test departures.spec` in `packages/shared`
  Expected: FAIL with missing module error.

- [x] **Step 3: Write minimal implementation**
  Create `packages/shared/src/departures.ts`:
  ```ts
  import * as z from "zod";

  export const DEPARTURE_TYPES = ["fixed_date", "estimated_year"] as const;
  export const DEPARTURE_STATUSES = ["open", "almost_full", "full", "departed", "cancelled"] as const;
  export const CURRENCIES = ["IDR", "USD"] as const;

  export interface PaymentMilestone {
    name: string;
    amount: number;
    daysBeforeDeparture: number;
  }

  export const createDepartureSchema = z.object({
    packageId: z.string().length(26),
    departureType: z.enum(DEPARTURE_TYPES).default("fixed_date"),
    departureDate: z.string().datetime(),
    returnDate: z.string().datetime(),
    seatTotal: z.number().int().positive(),
    currency: z.enum(CURRENCIES).default("IDR"),
    priceQuad: z.number().int().positive(),
    priceTriple: z.number().int().positive().nullable().optional(),
    priceDouble: z.number().int().positive().nullable().optional(),
    dpAmount: z.number().int().positive(),
    paymentSchedule: z.array(
      z.object({
        name: z.string().min(1),
        amount: z.number().int().positive(),
        daysBeforeDeparture: z.number().int().positive(),
      })
    ).min(1),
    notes: z.string().nullable().optional(),
  });

  export const updateDepartureSchema = createDepartureSchema.partial();

  export type CreateDepartureInput = z.input<typeof createDepartureSchema>;
  export type UpdateDepartureInput = z.input<typeof updateDepartureSchema>;

  export interface DepartureDto {
    id: string;
    tenantId: string;
    packageId: string;
    departureType: string;
    departureDate: string;
    returnDate: string;
    seatTotal: number;
    seatBooked: number;
    seatHeld: number;
    seatAvailable: number;
    currency: string;
    priceQuad: number;
    priceTriple: number | null;
    priceDouble: number | null;
    dpAmount: number;
    paymentSchedule: PaymentMilestone[];
    status: string;
    notes: string | null;
    createdAt: string;
    updatedAt: string;
  }

  export interface InventoryAdjustmentDto {
    id: string;
    tenantId: string;
    departureId: string;
    delta: number;
    reason: string;
    actorId: string;
    createdAt: string;
  }
  ```
  Expose it in `packages/shared/src/index.ts`:
  ```ts
  export * from "./departures";
  ```

- [x] **Step 4: Run test to verify it passes**
  Run: `bun run test departures.spec`
  Expected: PASS

- [x] **Step 5: Commit**
  Stage and commit Task 1 files.

---

### Task 2: Database Schema & Seeding

**Files:**
- Create: `packages/db/src/schema/departures.ts`
- Modify: `packages/db/src/schema/index.ts`
- Modify: `packages/db/src/seed.ts`

- [x] **Step 1: Write the failing test**
  Create `apps/api/src/departures/departures.service.int.spec.ts` asserting schema table definitions exist:
  ```ts
  import { describe, expect, it } from "vitest";
  import { departures } from "@cometkit/db";

  describe("Departures DB Schema", () => {
    it("exports departures table", () => {
      expect(departures).toBeDefined();
    });
  });
  ```

- [x] **Step 2: Run test to verify it fails**
  Run: `bun run test:int departures.service.int.spec` in `apps/api`
  Expected: FAIL with exports check.

- [x] **Step 3: Write minimal implementation**
  Create `packages/db/src/schema/departures.ts`:
  ```ts
  import { pgTable, text, timestamp, integer, pgEnum, check } from "drizzle-orm/pg-core";
  import { sql } from "drizzle-orm";
  import { tenants } from "./tenants";
  import { packages } from "./packages";

  export const departureTypeEnum = pgEnum("departure_type", ["fixed_date", "estimated_year"]);
  export const departureStatusEnum = pgEnum("departure_status", ["open", "almost_full", "full", "departed", "cancelled"]);
  export const currencyEnum = pgEnum("currency_type", ["IDR", "USD"]);

  export const departures = pgTable("departures", {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id").notNull().references(() => tenants.id),
    packageId: text("package_id").notNull().references(() => packages.id),
    departureType: departureTypeEnum("departure_type").default("fixed_date").notNull(),
    departureDate: timestamp("departure_date").notNull(),
    returnDate: timestamp("return_date").notNull(),
    seatTotal: integer("seat_total").notNull(),
    seatBooked: integer("seat_booked").default(0).notNull(),
    seatHeld: integer("seat_held").default(0).notNull(),
    currency: currencyEnum("currency").default("IDR").notNull(),
    priceQuad: integer("price_quad").notNull(),
    priceTriple: integer("price_triple"),
    priceDouble: integer("price_double"),
    dpAmount: integer("dp_amount").notNull(),
    paymentSchedule: text("payment_schedule").notNull(), // JSON string representing PaymentMilestone[]
    status: departureStatusEnum("status").default("open").notNull(),
    notes: text("notes"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  }, (table) => ({
    seatConstraint: check("seat_invariant", sql`${table.seatTotal} - ${table.seatBooked} - ${table.seatHeld} >= 0`),
  }));

  export const inventoryAdjustments = pgTable("inventory_adjustments", {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id").notNull().references(() => tenants.id),
    departureId: text("departure_id").notNull().references(() => departures.id),
    delta: integer("delta").notNull(),
    reason: text("reason").notNull(),
    actorId: text("actor_id").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  });
  ```
  Expose both tables in `packages/db/src/schema/index.ts`.
  Update seed script `packages/db/src/seed.ts` to insert a mock departure for the seeded package.

- [x] **Step 4: Run test to verify it passes**
  Generate and apply migration:
  `bun run db:generate`
  `bun run db:migrate`
  `bun run db:seed`
  Run test: `bun run test:int departures.service.int.spec` in `apps/api`
  Expected: PASS

- [x] **Step 5: Commit**
  Stage and commit migrations, seed modifications, and schema files.

---

### Task 3: Departures API & Mutations

**Files:**
- Create: `apps/api/src/departures/departures.service.ts`
- Create: `apps/api/src/departures/departures.controller.ts`
- Create: `apps/api/src/departures/departures.module.ts`
- Modify: `apps/api/src/app.module.ts`

- [x] **Step 1: Write the failing test**
  Add test assertions in `apps/api/src/departures/departures.service.int.spec.ts` for atomic inventory mutations, checking constraints under concurrency, and manual adjustment audits.

- [x] **Step 2: Run test to verify it fails**
  Run: `bun run test:int departures.service.int.spec`
  Expected: FAIL with controller/service imports missing.

- [x] **Step 3: Write minimal implementation**
  Create `apps/api/src/departures/departures.service.ts` using SQL updates for seat counts and transactional allotment changes.
  Create controller endpoints.
  Register `DeparturesModule` in `app.module.ts`.

- [x] **Step 4: Run test to verify it passes**
  Run: `bun run test:int departures.service.int.spec`
  Expected: PASS

- [x] **Step 5: Commit**
  Stage and commit Task 3 API module files.

---

### Task 4: Scheduler & Status Automations

**Files:**
- Create: `apps/api/src/departures/departures.cron.ts`
- Modify: `apps/api/src/departures/departures.service.ts`
- Modify: `apps/api/src/packages/packages.service.ts`

- [x] **Step 1: Write the failing test**
  Add unit tests verifying status lifecycle changes (`open` → `almost_full` → `full` → `departed`) and the package `needsReview` computed flag.

- [x] **Step 2: Run test to verify it fails**
  Run tests.
  Expected: FAIL.

- [x] **Step 3: Write minimal implementation**
  Add daily Cron job that sets past departures to `departed`. Add inline self-healing on queries. Integrate computed review status in `packages.service.ts`.

- [x] **Step 4: Run test to verify it passes**
  Run: `bun run verify`
  Expected: PASS

- [x] **Step 5: Commit**
  Stage and commit scheduler and status automation files.

---

### Task 5: Web UI Admin Panel & Widgets

**Files:**
- Create: `apps/web/src/hooks/use-departures.ts`
- Create: `apps/web/src/components/dashboard-widgets.tsx`
- Modify: `apps/web/src/app/dashboard/packages/[id]/page.tsx`
- Modify: `apps/web/src/app/dashboard/page.tsx`

- [x] **Step 1: Write the hook, components, and pages**
  Implement TanStack Query hooks in `use-departures.ts`. Add departures table list and creation modal in `packages/[id]/page.tsx`. Embed widgets in dashboard page.

- [x] **Step 2: Verify lint and compilation**
  Run: `bun run verify` in workspace root.
  Expected: PASS

- [x] **Step 3: Commit**
  Stage and commit Web UI files.
