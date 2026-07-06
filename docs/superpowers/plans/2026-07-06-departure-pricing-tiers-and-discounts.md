---
change: departure-pricing-tiers-and-discounts
design-doc: docs/superpowers/specs/2026-07-06-departure-pricing-tiers-and-discounts-design.md
base-ref: 6baf334ba9ef39bb7368b93f783c731c71291078
---

# Departure Pricing Tiers & Discounts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an optional discounted price for each occupancy tier (quad/triple/double) on departures, expose the full price matrix in the departure editor, and allow a first departure to be entered inline while creating a package.

**Architecture:** Pricing stays on the `departures` row. Three additive nullable integer columns (`priceQuadDiscount`, `priceTripleDiscount`, `priceDoubleDiscount`) flow through the three DRY layers in lock-step (db columns → shared wire shape → api mapper/payloads), mirroring the existing `priceTriple`/`priceDouble` pattern. The `discount <= normal` rule lives once in the shared Zod schema via `superRefine`. On the web, the departure entry fields + local state + payload assembly are extracted into a reusable `DepartureFormFields` component consumed by both the edit-time `DeparturesSection` and a new optional "First departure (optional)" card on the Create Package form. Inline create posts one departure after `createPackage` succeeds, the same non-atomic follow-up pattern already used for flyers and tags.

**Tech Stack:** Drizzle ORM (Postgres), Zod 4, NestJS, React (Next.js App Router), TanStack Query, ky, Vitest.

## Global Constraints

- **DRY layer boundaries:** wire shapes (request Zod + response interface) live in `packages/shared`; persisted columns live in `packages/db`; the api extends the typed mapper + payloads. Never redeclare a persisted or wire shape inside an app. Dependency direction `shared ← db ← api`, `shared ← web` — never reversed.
- **Prices are integers in minor units** (rupiah, no decimals). Discount columns are **nullable** integers, no default, no backfill.
- **Each discounted price, when provided, is a positive integer no greater than its normal counterpart**; otherwise rejected with a **field-level** error on the discount path.
- **A departure SHALL NOT be `open` without `priceQuad`; discounted prices never gate `open` status or availability.** No change to this existing rule.
- **Only `fixed_date` departureType is accepted** (existing Phase-1 guard, unchanged).
- **Run bun via bash** with `export PATH="/c/Users/rahma/.bun/bin:$PATH"` first (bun is not on the default bash PATH; the PowerShell tool is broken in this environment).
- **Always `db:migrate` before `db:seed`.** Migration adds columns to a populated table — all nullable, additive, reversible.
- **New runtime imports must be declared in that package's `package.json`** — bun's isolated linker does not hoist. (No new deps are expected in this change.)
- **In vitest-run files use `import * as z from "zod"`**, never `import { z }` (named form leaves `z.object` undefined under vitest).
- **Zod 4 idioms:** `z.number().int()`, `ctx.addIssue({ code: "custom", ... })`, `z.input<...>`.
- **Copy:** sentence case, plain verbs; error messages state what is wrong.

---

## File Structure

| File | Responsibility | Action |
|------|----------------|--------|
| `packages/db/src/schema/departures.ts` | Departure table columns | Modify — add 3 nullable integer columns |
| `packages/db/drizzle/00XX_*.sql` + `meta/` | Generated migration | Create (via `db:generate`) |
| `packages/shared/src/departures.ts` | Request schema + DTO for departures | Modify — split base object, add 3 fields, `superRefine`, DTO fields |
| `packages/shared/src/departures.spec.ts` | Shared schema unit spec | Modify — add discount cases |
| `apps/api/src/departures/departures.service.ts` | Mapper + create/update payloads | Modify — 3 symmetric lines each in mapper, create, update |
| `apps/api/src/departures/departures.service.int.spec.ts` | API integration spec | Modify — persist/round-trip + reject-above-normal |
| `apps/web/src/app/dashboard/packages/[id]/departure-form-fields.tsx` | Reusable departure entry fields + local state + payload assembly | Create |
| `apps/web/src/app/dashboard/packages/[id]/page.tsx` | Package detail page: `DeparturesSection` (edit) + Create Package form (inline create) | Modify — consume `DepartureFormFields` in both places |

---

## Task 1: Schema & migration (packages/db)

Add the three nullable discount columns to the `departures` table, then generate and apply the migration.

**Files:**
- Modify: `packages/db/src/schema/departures.ts:21-23` (after `priceDouble`)
- Create: `packages/db/drizzle/00XX_<generated-name>.sql` (+ updated `packages/db/drizzle/meta/`)

**Interfaces:**
- Consumes: nothing (first task).
- Produces: DB columns `price_quad_discount`, `price_triple_discount`, `price_double_discount` (all `integer`, nullable). The inferred `DbDeparture` type (`typeof departures.$inferSelect`) now carries `priceQuadDiscount: number | null`, `priceTripleDiscount: number | null`, `priceDoubleDiscount: number | null`. Task 3 relies on these property names.

- [x] **Step 1: Add the three columns to the schema**

In `packages/db/src/schema/departures.ts`, insert three lines immediately after the existing `priceDouble` column (line 23):

```ts
  priceQuad: integer("price_quad").notNull(),
  priceTriple: integer("price_triple"),
  priceDouble: integer("price_double"),
  priceQuadDiscount: integer("price_quad_discount"),
  priceTripleDiscount: integer("price_triple_discount"),
  priceDoubleDiscount: integer("price_double_discount"),
  dpAmount: integer("dp_amount").notNull(),
```

- [x] **Step 2: Generate the migration**

Run (from repo root):

```bash
export PATH="/c/Users/rahma/.bun/bin:$PATH"
cd packages/db && bun run db:generate
```

Expected: drizzle-kit prints a new migration file name (e.g. `0014_<name>.sql`) and reports 3 columns added to `departures`. Open the generated `.sql` and confirm it contains three `ALTER TABLE "departures" ADD COLUMN ...` statements for `price_quad_discount`, `price_triple_discount`, `price_double_discount`, all `integer` with no `NOT NULL` and no default.

- [x] **Step 3: Apply the migration**

Run (from repo root, needs local Postgres running):

```bash
export PATH="/c/Users/rahma/.bun/bin:$PATH"
cd packages/db && bun run db:migrate
```

Expected: drizzle-kit applies the migration with no error. (No `db:seed` needed — additive nullable columns require no reseed.)

- [x] **Step 4: Typecheck the db package**

```bash
export PATH="/c/Users/rahma/.bun/bin:$PATH"
cd packages/db && bun run typecheck
```

Expected: PASS (no type errors).

- [x] **Step 5: Commit**

```bash
git add packages/db/src/schema/departures.ts packages/db/drizzle
git commit -m "feat(db): add nullable discount price columns to departures"
```

---

## Task 2: Shared contract + unit spec (packages/shared)

Extend the request schema with the three discount fields and a cross-field `superRefine` (`discount <= normal`), add them to `DepartureDto`, and cover the rule with unit tests. **Test-first:** write the failing spec before the schema change.

**Files:**
- Modify: `packages/shared/src/departures.ts:13-60`
- Modify: `packages/shared/src/departures.spec.ts`

**Interfaces:**
- Consumes: nothing from earlier code tasks (schema is source of truth).
- Produces:
  - `createDepartureSchema` (a Zod effects schema) and `updateDepartureSchema` (partial + same refine), both accepting optional `priceQuadDiscount`, `priceTripleDiscount`, `priceDoubleDiscount` as `number | null | undefined`.
  - `CreateDepartureInput` / `UpdateDepartureInput` (`z.input<...>`) now include those three fields.
  - `DepartureDto` gains `priceQuadDiscount: number | null`, `priceTripleDiscount: number | null`, `priceDoubleDiscount: number | null`.
  - Task 3 (api) and Task 4/5 (web) rely on exactly these names.

> **Zod 4 gotcha (critical):** `superRefine` returns a `ZodEffects`, which has **no `.partial()` method**. You MUST apply `.partial()` to the plain object schema, not to the refined one. Define a base object, then export the create schema as `base.superRefine(fn)` and the update schema as `base.partial().superRefine(fn)`. Do not chain `.superRefine(...).partial()`.

- [x] **Step 1: Write the failing unit tests**

Replace the body of `packages/shared/src/departures.spec.ts` with (keeps the two existing cases, adds three discount cases):

```ts
import { describe, expect, it } from "vitest";
import { createDepartureSchema } from "./departures";

const base = {
  packageId: "01HGGGGGKKKKKQQQQQWWWWWRRR",
  departureType: "fixed_date" as const,
  departureDate: "2026-08-15T00:00:00.000Z",
  returnDate: "2026-08-24T00:00:00.000Z",
  seatTotal: 45,
  currency: "IDR" as const,
  priceQuad: 35000000,
  dpAmount: 5000000,
  paymentSchedule: [{ name: "DP", amount: 5000000, daysBeforeDeparture: 60 }],
};

describe("Departure schema validation", () => {
  it("validates valid input", () => {
    const res = createDepartureSchema.safeParse(base);
    expect(res.success).toBe(true);
  });

  it("rejects without quad price", () => {
    const { priceQuad: _omit, ...noQuad } = base;
    const res = createDepartureSchema.safeParse({ ...noQuad, paymentSchedule: [] });
    expect(res.success).toBe(false);
  });

  it("accepts a full matrix with discounts below their normal price", () => {
    const res = createDepartureSchema.safeParse({
      ...base,
      priceTriple: 40000000,
      priceDouble: 45000000,
      priceQuadDiscount: 33000000,
      priceTripleDiscount: 38000000,
      priceDoubleDiscount: 44000000,
    });
    expect(res.success).toBe(true);
  });

  it("rejects a discount above its normal counterpart with a field-level error", () => {
    const res = createDepartureSchema.safeParse({
      ...base,
      priceTriple: 40000000,
      priceTripleDiscount: 41000000,
    });
    expect(res.success).toBe(false);
    if (!res.success) {
      const paths = res.error.issues.map((i) => i.path.join("."));
      expect(paths).toContain("priceTripleDiscount");
    }
  });

  it("accepts input with discounts omitted", () => {
    const res = createDepartureSchema.safeParse(base);
    expect(res.success).toBe(true);
  });
});
```

- [x] **Step 2: Run the spec to verify it fails**

```bash
export PATH="/c/Users/rahma/.bun/bin:$PATH"
cd packages/shared && bun run test
```

Expected: FAIL — the discount cases fail because the schema does not yet define the discount fields or the refine (the above-normal case currently passes validation, and the field-error assertion is unmet).

- [x] **Step 3: Extend the schema (base object + fields + refine)**

In `packages/shared/src/departures.ts`, replace the current `createDepartureSchema` / `updateDepartureSchema` block (lines 13-37) with:

```ts
const departureBaseSchema = z.object({
  packageId: z.string().length(26),
  departureType: z.enum(DEPARTURE_TYPES).default("fixed_date"),
  departureDate: z.string().datetime(),
  returnDate: z.string().datetime(),
  seatTotal: z.number().int().positive(),
  currency: z.enum(CURRENCIES).default("IDR"),
  priceQuad: z.number().int().positive(),
  priceTriple: z.number().int().positive().nullable().optional(),
  priceDouble: z.number().int().positive().nullable().optional(),
  priceQuadDiscount: z.number().int().positive().nullable().optional(),
  priceTripleDiscount: z.number().int().positive().nullable().optional(),
  priceDoubleDiscount: z.number().int().positive().nullable().optional(),
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

// Each discounted price, when both it and its normal counterpart are present,
// must not exceed the normal price. Emits a field-level error on the discount path.
const enforceDiscountBounds = (
  val: {
    priceQuad?: number | null;
    priceTriple?: number | null;
    priceDouble?: number | null;
    priceQuadDiscount?: number | null;
    priceTripleDiscount?: number | null;
    priceDoubleDiscount?: number | null;
  },
  ctx: z.RefinementCtx,
) => {
  const pairs: Array<[keyof typeof val, keyof typeof val]> = [
    ["priceQuadDiscount", "priceQuad"],
    ["priceTripleDiscount", "priceTriple"],
    ["priceDoubleDiscount", "priceDouble"],
  ];
  for (const [discountKey, normalKey] of pairs) {
    const discount = val[discountKey];
    const normal = val[normalKey];
    if (typeof discount === "number" && typeof normal === "number" && discount > normal) {
      ctx.addIssue({
        code: "custom",
        message: "Discounted price must not exceed the normal price",
        path: [discountKey],
      });
    }
  }
};

export const createDepartureSchema = departureBaseSchema.superRefine(enforceDiscountBounds);
export const updateDepartureSchema = departureBaseSchema.partial().superRefine(enforceDiscountBounds);
```

Leave `CreateDepartureInput` / `UpdateDepartureInput` (`z.input<...>`) as they are — they resolve against the refined schemas automatically.

- [x] **Step 4: Add the three fields to `DepartureDto`**

In the same file, in the `DepartureDto` interface, insert the three fields right after `priceDouble`:

```ts
  priceQuad: number;
  priceTriple: number | null;
  priceDouble: number | null;
  priceQuadDiscount: number | null;
  priceTripleDiscount: number | null;
  priceDoubleDiscount: number | null;
  dpAmount: number;
```

- [x] **Step 5: Run the spec to verify it passes**

```bash
export PATH="/c/Users/rahma/.bun/bin:$PATH"
cd packages/shared && bun run test
```

Expected: PASS — all five cases green.

- [x] **Step 6: Typecheck the shared package**

```bash
export PATH="/c/Users/rahma/.bun/bin:$PATH"
cd packages/shared && bun run typecheck
```

Expected: PASS.

- [x] **Step 7: Commit**

```bash
git add packages/shared/src/departures.ts packages/shared/src/departures.spec.ts
git commit -m "feat(shared): add departure discount fields with discount<=normal refine"
```

---

## Task 3: API mapper + payloads + integration spec (apps/api)

Extend the DTO mapper, the create payload, and the partial-update payload with the three discount fields, then prove persistence/round-trip and above-normal rejection in the integration spec. **Test-first:** add the failing integration assertions before extending the service.

**Files:**
- Modify: `apps/api/src/departures/departures.service.ts:31-94, 156-166`
- Modify: `apps/api/src/departures/departures.service.int.spec.ts`

**Interfaces:**
- Consumes: `DbDeparture` (Task 1 columns), `createDepartureSchema` / `DepartureDto` (Task 2 fields), `CreateDepartureInput`.
- Produces: `DeparturesService.create` and `.update` persist the three discount fields; `mapToDto` returns them. The web layer (Tasks 4/5) posts these fields and reads them back.

> **Note:** the integration spec calls `service.create(...)` directly with a typed `CreateDepartureInput`, so the `discount <= normal` refine (which lives in the Zod pipe, not the service) is **not** exercised by a plain service call. To assert rejection at the schema level, call `createDepartureSchema.safeParse(...)` in the spec. Persistence/round-trip is asserted through the service.

- [x] **Step 1: Write the failing integration assertions**

In `apps/api/src/departures/departures.service.int.spec.ts`, add these two `it` blocks inside the existing `describe("DeparturesService (integration)", ...)` block (after the "creates a departure under a package" test). Also add the import for the schema at the top (extend the existing `@cometkit/shared` import):

At the top, change the shared import to include the schema:

```ts
import { DEFAULT_TENANT_SLUG, createDepartureSchema } from "@cometkit/shared";
```

Then add:

```ts
  it("persists and round-trips the full discount matrix", async () => {
    const dep = await service.create({
      packageId,
      departureType: "fixed_date",
      departureDate: new Date("2026-08-15T00:00:00.000Z").toISOString(),
      returnDate: new Date("2026-08-24T00:00:00.000Z").toISOString(),
      seatTotal: 45,
      currency: "IDR",
      priceQuad: 35000000,
      priceTriple: 40000000,
      priceDouble: 45000000,
      priceQuadDiscount: 33000000,
      priceTripleDiscount: 38000000,
      priceDoubleDiscount: 44000000,
      dpAmount: 5000000,
      paymentSchedule: [{ name: "DP", amount: 5000000, daysBeforeDeparture: 60 }],
    });
    createdDepartureIds.push(dep.id);

    expect(dep.priceQuadDiscount).toBe(33000000);
    expect(dep.priceTripleDiscount).toBe(38000000);
    expect(dep.priceDoubleDiscount).toBe(44000000);

    const roundTrip = await service.findOne(dep.id);
    expect(roundTrip.priceQuadDiscount).toBe(33000000);
    expect(roundTrip.priceTripleDiscount).toBe(38000000);
    expect(roundTrip.priceDoubleDiscount).toBe(44000000);
  });

  it("rejects a discount above its normal counterpart at the schema level", () => {
    const res = createDepartureSchema.safeParse({
      packageId,
      departureType: "fixed_date",
      departureDate: new Date("2026-08-15T00:00:00.000Z").toISOString(),
      returnDate: new Date("2026-08-24T00:00:00.000Z").toISOString(),
      seatTotal: 45,
      currency: "IDR",
      priceQuad: 35000000,
      priceTriple: 40000000,
      priceTripleDiscount: 41000000,
      dpAmount: 5000000,
      paymentSchedule: [{ name: "DP", amount: 5000000, daysBeforeDeparture: 60 }],
    });
    expect(res.success).toBe(false);
  });
```

- [x] **Step 2: Run the integration spec to verify it fails**

```bash
export PATH="/c/Users/rahma/.bun/bin:$PATH"
cd apps/api && bun run test:int
```

Expected: FAIL — `dep.priceQuadDiscount` is `undefined` (mapper does not map it yet) and the create payload does not persist the columns. (The schema-level rejection case may already pass because Task 2 shipped the refine; the persistence test is the one that fails here.)

- [x] **Step 3: Extend `mapToDto`**

In `apps/api/src/departures/departures.service.ts`, inside `mapToDto` (around lines 45-47), insert the three discount mappings after `priceDouble`:

```ts
      priceQuad: dep.priceQuad,
      priceTriple: dep.priceTriple ?? null,
      priceDouble: dep.priceDouble ?? null,
      priceQuadDiscount: dep.priceQuadDiscount ?? null,
      priceTripleDiscount: dep.priceTripleDiscount ?? null,
      priceDoubleDiscount: dep.priceDoubleDiscount ?? null,
      dpAmount: dep.dpAmount,
```

- [x] **Step 4: Extend the create payload**

In the `create` method (around lines 78-81), insert the three fields after `priceDouble`:

```ts
        priceQuad: input.priceQuad,
        priceTriple: input.priceTriple ?? null,
        priceDouble: input.priceDouble ?? null,
        priceQuadDiscount: input.priceQuadDiscount ?? null,
        priceTripleDiscount: input.priceTripleDiscount ?? null,
        priceDoubleDiscount: input.priceDoubleDiscount ?? null,
        dpAmount: input.dpAmount,
```

- [x] **Step 5: Extend the partial-update payload**

In the `update` method (around lines 161-163), insert the three conditional assignments after the `priceDouble` line:

```ts
    if (input.priceQuad !== undefined) payload.priceQuad = input.priceQuad;
    if (input.priceTriple !== undefined) payload.priceTriple = input.priceTriple;
    if (input.priceDouble !== undefined) payload.priceDouble = input.priceDouble;
    if (input.priceQuadDiscount !== undefined) payload.priceQuadDiscount = input.priceQuadDiscount;
    if (input.priceTripleDiscount !== undefined) payload.priceTripleDiscount = input.priceTripleDiscount;
    if (input.priceDoubleDiscount !== undefined) payload.priceDoubleDiscount = input.priceDoubleDiscount;
    if (input.dpAmount !== undefined) payload.dpAmount = input.dpAmount;
```

- [x] **Step 6: Run the integration spec to verify it passes**

```bash
export PATH="/c/Users/rahma/.bun/bin:$PATH"
cd apps/api && bun run test:int
```

Expected: PASS — all departure integration tests green, including the two new ones.

- [x] **Step 7: Typecheck the api package**

```bash
export PATH="/c/Users/rahma/.bun/bin:$PATH"
cd apps/api && bun run typecheck
```

Expected: PASS.

- [x] **Step 8: Commit**

```bash
git add apps/api/src/departures/departures.service.ts apps/api/src/departures/departures.service.int.spec.ts
git commit -m "feat(api): map and persist departure discount fields"
```

---

## Task 4: Web — reusable `DepartureFormFields` + editor wiring (apps/web)

Extract the departure entry fields, their local state, and payload assembly into a reusable client component, then wire it into the existing edit-time `DeparturesSection` (add the triple/double normal inputs + all three discount inputs + show discounts on the card). This task ships the standalone-editor half of the UI; Task 5 reuses the same component for inline create.

**Files:**
- Create: `apps/web/src/app/dashboard/packages/[id]/departure-form-fields.tsx`
- Modify: `apps/web/src/app/dashboard/packages/[id]/page.tsx` (the `DeparturesSection` function, ~lines 727-1095)

**Interfaces:**
- Consumes: `CreateDepartureInput` (Task 2), UI primitives `Input`, `Label` (`@/components/ui/...`).
- Produces:
  - `DepartureFormFields` — a `forwardRef` component rendering the full matrix (dates, seats, DP, quad/triple/double normal + discount inputs), owning its own local state.
  - `DepartureFormFieldsHandle` — imperative handle: `buildPayload(): Omit<CreateDepartureInput, "packageId"> | null` (returns `null` when no departure date is entered — the "filled" signal), and `reset(): void`.
  - Task 5 consumes exactly these two exports.

- [x] **Step 1: Create the `DepartureFormFields` component**

Create `apps/web/src/app/dashboard/packages/[id]/departure-form-fields.tsx`:

```tsx
"use client";

import { forwardRef, useImperativeHandle, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { CreateDepartureInput } from "@cometkit/shared";

export type DeparturePayload = Omit<CreateDepartureInput, "packageId">;

export interface DepartureFormFieldsHandle {
  /** Assemble the departure payload, or null when no departure date is entered. */
  buildPayload: () => DeparturePayload | null;
  /** Reset all fields to their defaults. */
  reset: () => void;
}

const DEFAULTS = {
  depDate: "",
  retDate: "",
  seatTotal: 45,
  priceQuad: 35000000,
  dpAmount: 5000000,
};

export const DepartureFormFields = forwardRef<DepartureFormFieldsHandle>(
  function DepartureFormFields(_props, ref) {
    const [depDate, setDepDate] = useState(DEFAULTS.depDate);
    const [retDate, setRetDate] = useState(DEFAULTS.retDate);
    const [seatTotal, setSeatTotal] = useState<number>(DEFAULTS.seatTotal);
    const [dpAmount, setDpAmount] = useState<number>(DEFAULTS.dpAmount);
    const [priceQuad, setPriceQuad] = useState<number>(DEFAULTS.priceQuad);
    const [priceTriple, setPriceTriple] = useState<number | "">("");
    const [priceDouble, setPriceDouble] = useState<number | "">("");
    const [priceQuadDiscount, setPriceQuadDiscount] = useState<number | "">("");
    const [priceTripleDiscount, setPriceTripleDiscount] = useState<number | "">("");
    const [priceDoubleDiscount, setPriceDoubleDiscount] = useState<number | "">("");

    useImperativeHandle(ref, () => ({
      buildPayload: () => {
        // "Filled" detection: a departure date is the unambiguous signal.
        if (!depDate) return null;
        const nullable = (v: number | "") => (v === "" ? null : v);
        return {
          departureType: "fixed_date",
          departureDate: new Date(depDate).toISOString(),
          // Empty return date fails the schema's datetime() check → field error surfaced.
          returnDate: retDate ? new Date(retDate).toISOString() : "",
          seatTotal,
          currency: "IDR",
          priceQuad,
          priceTriple: nullable(priceTriple),
          priceDouble: nullable(priceDouble),
          priceQuadDiscount: nullable(priceQuadDiscount),
          priceTripleDiscount: nullable(priceTripleDiscount),
          priceDoubleDiscount: nullable(priceDoubleDiscount),
          dpAmount,
          // Payment schedule derives from the NORMAL quad price only.
          paymentSchedule: [
            { name: "DP", amount: dpAmount, daysBeforeDeparture: 60 },
            { name: "Pelunasan", amount: priceQuad - dpAmount, daysBeforeDeparture: 30 },
          ],
        };
      },
      reset: () => {
        setDepDate(DEFAULTS.depDate);
        setRetDate(DEFAULTS.retDate);
        setSeatTotal(DEFAULTS.seatTotal);
        setDpAmount(DEFAULTS.dpAmount);
        setPriceQuad(DEFAULTS.priceQuad);
        setPriceTriple("");
        setPriceDouble("");
        setPriceQuadDiscount("");
        setPriceTripleDiscount("");
        setPriceDoubleDiscount("");
      },
    }));

    const num = (v: string): number | "" => (v === "" ? "" : Number(v));

    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="depDate" className="text-xs">Departure date</Label>
            <Input id="depDate" type="date" value={depDate}
              onChange={(e) => setDepDate(e.target.value)} className="h-8 text-xs" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="retDate" className="text-xs">Return date</Label>
            <Input id="retDate" type="date" value={retDate}
              onChange={(e) => setRetDate(e.target.value)} className="h-8 text-xs" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="seatTotalInput" className="text-xs">Total seats</Label>
            <Input id="seatTotalInput" type="number" value={seatTotal}
              onChange={(e) => setSeatTotal(Number(e.target.value))} className="h-8 text-xs" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="dpAmountInput" className="text-xs">DP amount (Rp)</Label>
            <Input id="dpAmountInput" type="number" value={dpAmount}
              onChange={(e) => setDpAmount(Number(e.target.value))} className="h-8 text-xs" />
          </div>
        </div>

        <div className="grid gap-2">
          <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            Price matrix — normal / discounted (Rp)
          </span>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="priceQuadInput" className="text-xs">Quad — normal</Label>
              <Input id="priceQuadInput" type="number" value={priceQuad}
                onChange={(e) => setPriceQuad(Number(e.target.value))} className="h-8 text-xs" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="priceQuadDiscountInput" className="text-xs">Quad — discounted</Label>
              <Input id="priceQuadDiscountInput" type="number" value={priceQuadDiscount}
                onChange={(e) => setPriceQuadDiscount(num(e.target.value))}
                placeholder="optional" className="h-8 text-xs" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="priceTripleInput" className="text-xs">Triple — normal</Label>
              <Input id="priceTripleInput" type="number" value={priceTriple}
                onChange={(e) => setPriceTriple(num(e.target.value))}
                placeholder="optional" className="h-8 text-xs" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="priceTripleDiscountInput" className="text-xs">Triple — discounted</Label>
              <Input id="priceTripleDiscountInput" type="number" value={priceTripleDiscount}
                onChange={(e) => setPriceTripleDiscount(num(e.target.value))}
                placeholder="optional" className="h-8 text-xs" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="priceDoubleInput" className="text-xs">Double — normal</Label>
              <Input id="priceDoubleInput" type="number" value={priceDouble}
                onChange={(e) => setPriceDouble(num(e.target.value))}
                placeholder="optional" className="h-8 text-xs" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="priceDoubleDiscountInput" className="text-xs">Double — discounted</Label>
              <Input id="priceDoubleDiscountInput" type="number" value={priceDoubleDiscount}
                onChange={(e) => setPriceDoubleDiscount(num(e.target.value))}
                placeholder="optional" className="h-8 text-xs" />
            </div>
          </div>
        </div>
      </div>
    );
  },
);
```

- [x] **Step 2: Import the component and a ref hook in the page**

In `apps/web/src/app/dashboard/packages/[id]/page.tsx`:

1. Extend the React import (line 5) to include `useRef`:

```tsx
import { useState, useEffect, useRef, type FormEvent } from "react";
```

2. Add the component import near the other local imports (after the `use-providers` / `lib/api` imports, ~line 29):

```tsx
import { DepartureFormFields, type DepartureFormFieldsHandle } from "./departure-form-fields";
```

- [x] **Step 3: Rewire `DeparturesSection` to use `DepartureFormFields`**

In the `DeparturesSection` function, replace the price/seat/date local state and the inline add-form markup with the reusable component. Specifically:

1. Remove these local state lines (currently ~lines 735-739):

```tsx
  const [depDate, setDepDate] = useState("");
  const [retDate, setRetDate] = useState("");
  const [seatTotal, setSeatTotal] = useState(45);
  const [priceQuad, setPriceQuad] = useState(35000000);
  const [dpAmount, setDpAmount] = useState(5000000);
```

and replace them with a single ref (keep the `showAddForm` and `error` state that follow):

```tsx
  const formRef = useRef<DepartureFormFieldsHandle>(null);
```

2. Replace the `handleAddDeparture` function (currently ~lines 759-792) with:

```tsx
  const handleAddDeparture = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const payload = formRef.current?.buildPayload();
    if (!payload) {
      setError("Departure date is required.");
      return;
    }
    try {
      await createMutation.mutateAsync({ packageId, ...payload });
      formRef.current?.reset();
      setShowAddForm(false);
      void refetch();
    } catch (err) {
      setError(await readApiError(err));
    }
  };
```

3. Replace the add-departure `<form>` body (the block from `{showAddForm && (` down to its closing `)}`, currently ~lines 856-929) with a form that renders the reusable fields:

```tsx
        {showAddForm && (
          <form onSubmit={handleAddDeparture} className="mb-6 border p-4 rounded-lg bg-muted/40 space-y-4">
            <h3 className="font-mono text-sm font-bold uppercase tracking-wider">New departure slot</h3>
            <DepartureFormFields ref={formRef} />
            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button type="button" variant="outline" size="sm" onClick={() => { formRef.current?.reset(); setShowAddForm(false); }}>
                Cancel
              </Button>
              <Button type="submit" size="sm">
                Create schedule
              </Button>
            </div>
          </form>
        )}
```

- [x] **Step 4: Show discounted prices on the departure card**

In the departure card "Pricing & Schedule" row (currently ~lines 1036-1047), add discounted-price spans after the `Base:` span. Replace that inner `<div className="flex flex-wrap gap-x-4 ...">` block with:

```tsx
                      <div className="flex flex-wrap gap-x-4 mt-0.5 text-muted-foreground font-mono">
                        <span>Base: <strong className="text-foreground">Rp {dep.priceQuad.toLocaleString("id-ID")}</strong></span>
                        {dep.priceQuadDiscount != null && (
                          <span>Quad disc: <strong className="text-foreground">Rp {dep.priceQuadDiscount.toLocaleString("id-ID")}</strong></span>
                        )}
                        {dep.priceTriple != null && (
                          <span>Triple: <strong className="text-foreground">Rp {dep.priceTriple.toLocaleString("id-ID")}</strong></span>
                        )}
                        {dep.priceTripleDiscount != null && (
                          <span>Triple disc: <strong className="text-foreground">Rp {dep.priceTripleDiscount.toLocaleString("id-ID")}</strong></span>
                        )}
                        {dep.priceDouble != null && (
                          <span>Double: <strong className="text-foreground">Rp {dep.priceDouble.toLocaleString("id-ID")}</strong></span>
                        )}
                        {dep.priceDoubleDiscount != null && (
                          <span>Double disc: <strong className="text-foreground">Rp {dep.priceDoubleDiscount.toLocaleString("id-ID")}</strong></span>
                        )}
                        <span>DP: <strong className="text-foreground">Rp {dep.dpAmount.toLocaleString("id-ID")}</strong></span>
                        {dep.paymentSchedule.map((milestone, mIdx) => (
                          <span key={mIdx}>
                            {milestone.name}: <strong className="text-foreground">Rp {milestone.amount.toLocaleString("id-ID")}</strong> ({milestone.daysBeforeDeparture} days before departure)
                          </span>
                        ))}
                      </div>
```

- [x] **Step 5: Typecheck and lint the web package**

```bash
export PATH="/c/Users/rahma/.bun/bin:$PATH"
cd apps/web && bun run typecheck && bun run lint
```

Expected: PASS — no unused-variable errors (confirm the removed `useState` setters are fully gone) and no type errors on `DepartureFormFieldsHandle`.

- [x] **Step 6: Commit**

```bash
git add apps/web/src/app/dashboard/packages/[id]/departure-form-fields.tsx apps/web/src/app/dashboard/packages/[id]/page.tsx
git commit -m "feat(web): reusable departure fields with discount matrix in editor"
```

---

## Task 5: Web — inline first departure on package create (apps/web)

Add an optional "First departure (optional)" card to the Create Package form (admin-only, only when `isNew`) reusing `DepartureFormFields`, and post that departure after `createPackage` succeeds — the same non-atomic follow-up pattern already used for flyers and tags. Skip cleanly when no departure date is entered; surface errors via `readApiError`.

**Files:**
- Modify: `apps/web/src/app/dashboard/packages/[id]/page.tsx` (the `PackageDetailPage` component)

**Interfaces:**
- Consumes: `DepartureFormFields` / `DepartureFormFieldsHandle` (Task 4), `useCreateDeparture` (already imported at line 24), `api` / `readApiError`, `createPackage.mutateAsync`.
- Produces: package creation optionally creates exactly one departure. No new exports.

- [x] **Step 1: Add a ref for the inline departure fields**

In `PackageDetailPage`, near the other `useState`/refs (after the tag state, ~line 78), add:

```tsx
  const inlineDepartureRef = useRef<DepartureFormFieldsHandle>(null);
```

- [x] **Step 2: Post the inline departure after package creation**

In `handleFormSubmit`, in the `if (isNew)` branch, after the flyers and tags follow-up loops and **before** `router.push(...)` (currently ~lines 166-175), insert the inline-departure follow-up:

```tsx
      if (isNew) {
        const created = await createPackage.mutateAsync(payload);
        // Save uploaded flyers
        for (const fUrl of flyers) {
          await api.post(`packages/${created.id}/flyer`, { json: { url: fUrl } });
        }
        // Save selected tags
        for (const tName of selectedTags) {
          await api.post("packages/tags", { json: { name: tName } });
        }
        // Optional inline first departure: skip cleanly when no date was entered.
        const departurePayload = inlineDepartureRef.current?.buildPayload();
        if (departurePayload) {
          await api.post("departures", { json: { packageId: created.id, ...departurePayload } });
        }
        router.push(`/dashboard/packages/${created.id}`);
      } else {
```

(The surrounding `try { ... } catch (err) { setError(await readApiError(err)); }` already wraps this block, so a failed departure post surfaces the field-level error near the create action while the package persists as a draft — Task 5's error requirement is met by the existing catch.)

- [x] **Step 3: Render the "First departure (optional)" card**

In the create/edit `<form onSubmit={handleFormSubmit}>` (inside `PackageDetailPage`), add a new `Card` after the "Inclusions & Exclusions" card and **before** the submit-button block (currently ~line 561, right before `{isAdmin && (<div className="flex justify-end">...`). Gate it on `isAdmin && isNew`:

```tsx
            {isAdmin && isNew && (
              <Card>
                <CardHeader>
                  <CardTitle>First departure (optional)</CardTitle>
                  <CardDescription>
                    Add the first departure schedule now, or leave empty and add departures later. Enter a departure date to include it.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <DepartureFormFields ref={inlineDepartureRef} />
                </CardContent>
              </Card>
            )}
```

- [x] **Step 4: Typecheck and lint the web package**

```bash
export PATH="/c/Users/rahma/.bun/bin:$PATH"
cd apps/web && bun run typecheck && bun run lint
```

Expected: PASS.

- [x] **Step 5: Manual smoke check (optional but recommended)**

With `bun run dev` running, as an admin: open `/dashboard/packages/new`, fill required package fields, enter a departure date + quad price in the "First departure (optional)" card, submit. Expected: redirect to the new package detail page showing exactly one departure with the entered prices. Repeat leaving the departure card empty → package created with zero departures, no error. Enter a triple discount above the triple normal → field-level error shown near the create action, no departure created (package still created as draft).

- [x] **Step 6: Commit**

```bash
git add apps/web/src/app/dashboard/packages/[id]/page.tsx
git commit -m "feat(web): optional inline first departure on package create"
```

---

## Task 6: Verify

Run the full quality gate and the integration path; confirm all green.

**Files:** none (verification only).

- [x] **Step 1: Run the full workspace gate**

```bash
export PATH="/c/Users/rahma/.bun/bin:$PATH"
cd "C:/Sobari/Ai/tawaf-sai/e-tawafsai" && bun run verify
```

Expected: PASS — `turbo run typecheck lint test` green across all packages (db, shared, api, web), including the extended `departures.spec.ts`.

- [x] **Step 2: Run the departures integration path**

```bash
export PATH="/c/Users/rahma/.bun/bin:$PATH"
cd apps/api && bun run test:int
```

Expected: PASS — all `departures.service.int.spec.ts` tests green, including the discount persist/round-trip and schema-level rejection cases.

- [x] **Step 3: Final commit (if any verification-driven fixes were made)**

```bash
git add -A
git commit -m "chore(verify): departure pricing tiers & discounts gate green"
```

(Skip if there is nothing to commit.)

---

## Self-Review

**Spec coverage (delta `specs/departure-inventory/spec.md`):**

- *Departure entity with price matrix* (6 price fields, minor units, discount ≤ normal field-level error, `open`-without-quad rule unchanged) → Tasks 1 (columns), 2 (schema + refine + DTO), 3 (mapper/payloads). ✅
- *Scenario: Create departure with full price matrix* → Task 3 integration persist/round-trip. ✅
- *Scenario: Discounted price above normal rejected* → Task 2 unit spec + Task 3 schema-level spec. ✅
- *Scenario: Discounted prices optional* → Task 2 unit spec ("discounts omitted"), nullable columns Task 1. ✅
- *Scenario: estimated_year rejected in Phase 1* → unchanged existing guard (no regression; covered by existing int test). ✅
- *Inline first departure on package creation* (optional entry; created after package; empty → zero departures; same validation) → Tasks 4 (reusable fields) + 5 (card + follow-up post). ✅
- *Scenario: Package created with an inline departure* → Task 5 Step 2/3 + smoke check. ✅
- *Scenario: Package created without a departure* → Task 5 `buildPayload()` returns `null` when no date → post skipped. ✅
- *Scenario: Invalid inline departure blocks creation feedback* → Task 5 existing `catch` + `readApiError` surfaces the schema field error. ✅

**tasks.md mapping:** group 1 → Task 1; group 2 → Task 2; group 3 → Task 3; group 4 → Task 4; group 5 → Task 5; group 6 → Task 6. ✅

**Type consistency:** `priceQuadDiscount` / `priceTripleDiscount` / `priceDoubleDiscount` used identically across db columns, `departureBaseSchema`, `DepartureDto`, `mapToDto`, create/update payloads, and web `buildPayload`. `DepartureFormFieldsHandle.buildPayload()` returns `Omit<CreateDepartureInput, "packageId"> | null`, consumed as `{ packageId, ...payload }` in both Task 4 (editor) and Task 5 (inline). `reset()` name consistent. ✅

**Placeholder scan:** every code step contains the full literal code; run commands include the bun PATH export and expected output. No TBD/TODO. ✅

**Known accepted gap (from design):** a partial update sending only a discount field without its normal counterpart cannot be compared at schema level; both UI entry points always submit the full matrix, so this is documented and out of scope.
