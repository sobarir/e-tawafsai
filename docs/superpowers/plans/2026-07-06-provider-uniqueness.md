---
change: provider-uniqueness
design-doc: docs/superpowers/specs/2026-07-06-provider-uniqueness-design.md
base-ref: f62d9901db75beb238507c9b42aa838c47fd7ecf
---

# Provider Uniqueness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Enforce per-tenant provider uniqueness (normalized name + PPIU) with a 409 on conflicting create/update, and merge existing duplicates (repointing packages) via a one-time script.

**Architecture:** Pure normalization + union-find merge-planning live in `packages/shared` (unit-tested there, the only package `verify` runs vitest in). `ProvidersService` (apps/api) normalizes PPIU and pre-checks for conflicts → `ConflictException`, with a DB unique-violation caught as the concurrency backstop. Two expression/partial unique indexes on `providers` (packages/db) are the hard guarantee. A `bun` script in packages/db loads providers per tenant, plans merges, and applies them (repoint `packages.providerId`, delete losers) in one transaction.

**Tech Stack:** TypeScript 6, NestJS, Drizzle ORM 0.45 + postgres-js, Zod 4, Vitest 4, Bun, drizzle-kit 0.31.

## Global Constraints

- Wire shapes / cross-package pure helpers live in `packages/shared`; columns in `packages/db`; dependency direction `shared ← db ← api`. Never reverse.
- New runtime imports must be declared in that package's `package.json` (bun isolated linker does not hoist).
- Zod 4 idioms; under vitest use `import * as z from "zod"` (named import breaks). (No zod needed in these files, but keep the rule.)
- Errors: throw Nest `HttpException` subclasses; never `try/catch` to shape errors except to translate a driver error into an `HttpException`.
- Services log domain events: `this.logger.info({ ... }, "noun.verb")`. Never log secrets.
- Unit specs are DB-free and run in `verify`; DB-touching paths get a `*.int.spec.ts` run by `bun run test:int` (needs local Postgres + `db:seed`).
- Nest route order and existing provider behavior (activation/cascade/commission DTO) are unchanged.
- `bun` is not on the bash PATH by default: `export PATH="/c/Users/rahma/.bun/bin:$PATH"` before bun/bunx.

---

### Task 1: Provider normalization helpers (shared)

**Files:**
- Create: `packages/shared/src/provider-dedup.ts`
- Modify: `packages/shared/src/index.ts`
- Test: `packages/shared/src/provider-dedup.spec.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `normalizeProviderName(name: string): string` — `name.trim().toLowerCase()`
  - `normalizePpiu(ppiu: string | null | undefined): string | null` — trims; empty/whitespace or nullish → `null`

- [x] **Step 1: Write the failing test**

```ts
// packages/shared/src/provider-dedup.spec.ts
import { describe, expect, it } from "vitest";
import { normalizeProviderName, normalizePpiu } from "./provider-dedup";

describe("normalizeProviderName", () => {
  it("lowercases and trims", () => {
    expect(normalizeProviderName("  PT AL HIJAZ ")).toBe("pt al hijaz");
  });
  it("treats case/space variants as equal", () => {
    expect(normalizeProviderName("PT Al Hijaz")).toBe(normalizeProviderName("pt al hijaz "));
  });
});

describe("normalizePpiu", () => {
  it("trims a present value", () => {
    expect(normalizePpiu(" 12345 ")).toBe("12345");
  });
  it("coerces empty / whitespace / nullish to null", () => {
    expect(normalizePpiu("")).toBeNull();
    expect(normalizePpiu("   ")).toBeNull();
    expect(normalizePpiu(null)).toBeNull();
    expect(normalizePpiu(undefined)).toBeNull();
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `export PATH="/c/Users/rahma/.bun/bin:$PATH" && cd packages/shared && bunx vitest run src/provider-dedup.spec.ts`
Expected: FAIL — cannot find module `./provider-dedup`.

- [x] **Step 3: Write minimal implementation**

```ts
// packages/shared/src/provider-dedup.ts
export function normalizeProviderName(name: string): string {
  return name.trim().toLowerCase();
}

export function normalizePpiu(ppiu: string | null | undefined): string | null {
  if (ppiu == null) return null;
  const trimmed = ppiu.trim();
  return trimmed === "" ? null : trimmed;
}
```

- [x] **Step 4: Export from the shared barrel**

```ts
// packages/shared/src/index.ts — add after the ./providers line
export * from "./provider-dedup";
```

- [x] **Step 5: Run test to verify it passes**

Run: `export PATH="/c/Users/rahma/.bun/bin:$PATH" && cd packages/shared && bunx vitest run src/provider-dedup.spec.ts`
Expected: PASS (6 assertions).

- [x] **Step 6: Commit**

```bash
git add packages/shared/src/provider-dedup.ts packages/shared/src/provider-dedup.spec.ts packages/shared/src/index.ts
git commit -m "feat(provider-uniqueness): add shared provider normalization helpers"
```

---

### Task 2: Union-find merge planner (shared)

**Files:**
- Modify: `packages/shared/src/provider-dedup.ts`
- Test: `packages/shared/src/provider-dedup.spec.ts`

**Interfaces:**
- Consumes: `normalizeProviderName`, `normalizePpiu` (Task 1).
- Produces:
  - `interface ProviderMergeInput { id: string; name: string; ppiuLicenseNo: string | null; isActive: boolean }`
  - `interface ProviderMergePlan { survivorId: string; loserIds: string[] }`
  - `planProviderMerges(rows: ProviderMergeInput[]): ProviderMergePlan[]` — groups ONE tenant's rows into clusters by transitive closure of shared normalized name OR shared non-empty normalized PPIU; returns one plan per cluster that has ≥1 loser. Survivor = `isActive` first, then lowest `id` (ULID lexicographic). `loserIds` sorted ascending. Plans sorted by `survivorId`.

- [x] **Step 1: Write the failing test**

```ts
// append to packages/shared/src/provider-dedup.spec.ts
import { planProviderMerges, type ProviderMergeInput } from "./provider-dedup";

const row = (over: Partial<ProviderMergeInput> & { id: string }): ProviderMergeInput => ({
  name: "PT X", ppiuLicenseNo: null, isActive: false, ...over,
});

describe("planProviderMerges", () => {
  it("returns no plans when there are no duplicates", () => {
    const plans = planProviderMerges([
      row({ id: "01A", name: "Alpha" }),
      row({ id: "01B", name: "Beta", ppiuLicenseNo: "999" }),
    ]);
    expect(plans).toEqual([]);
  });

  it("clusters transitively across name and ppiu edges (A-name-B-ppiu-C)", () => {
    // A & B share a name; B & C share a PPIU; A and C share neither -> one cluster
    const plans = planProviderMerges([
      row({ id: "01A", name: "PT Al Hijaz" }),
      row({ id: "01B", name: "pt al hijaz ", ppiuLicenseNo: "12345" }),
      row({ id: "01C", name: "Different", ppiuLicenseNo: " 12345 " }),
    ]);
    expect(plans).toHaveLength(1);
    expect(plans[0]).toEqual({ survivorId: "01A", loserIds: ["01B", "01C"] });
  });

  it("prefers an active survivor over an older ULID", () => {
    const plans = planProviderMerges([
      row({ id: "01A", name: "Dup" }),           // older, inactive
      row({ id: "01Z", name: "dup", isActive: true }), // newer, active
    ]);
    expect(plans).toEqual([{ survivorId: "01Z", loserIds: ["01A"] }]);
  });

  it("does not cluster blank/null PPIUs together", () => {
    const plans = planProviderMerges([
      row({ id: "01A", name: "One", ppiuLicenseNo: "" }),
      row({ id: "01B", name: "Two", ppiuLicenseNo: "   " }),
    ]);
    expect(plans).toEqual([]);
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `export PATH="/c/Users/rahma/.bun/bin:$PATH" && cd packages/shared && bunx vitest run src/provider-dedup.spec.ts`
Expected: FAIL — `planProviderMerges` is not exported.

- [x] **Step 3: Write minimal implementation**

```ts
// append to packages/shared/src/provider-dedup.ts
export interface ProviderMergeInput {
  id: string;
  name: string;
  ppiuLicenseNo: string | null;
  isActive: boolean;
}

export interface ProviderMergePlan {
  survivorId: string;
  loserIds: string[];
}

export function planProviderMerges(rows: ProviderMergeInput[]): ProviderMergePlan[] {
  // Union-find over row indices.
  const parent = rows.map((_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };
  const union = (a: number, b: number) => {
    const ra = find(a), rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  };

  // Build edges: same normalized name, OR same non-empty normalized PPIU.
  const byName = new Map<string, number>();
  const byPpiu = new Map<string, number>();
  rows.forEach((r, i) => {
    const nameKey = normalizeProviderName(r.name);
    const seenName = byName.get(nameKey);
    if (seenName !== undefined) union(seenName, i);
    else byName.set(nameKey, i);

    const ppiuKey = normalizePpiu(r.ppiuLicenseNo);
    if (ppiuKey !== null) {
      const seenPpiu = byPpiu.get(ppiuKey);
      if (seenPpiu !== undefined) union(seenPpiu, i);
      else byPpiu.set(ppiuKey, i);
    }
  });

  // Group indices by cluster root.
  const clusters = new Map<number, number[]>();
  rows.forEach((_, i) => {
    const root = find(i);
    const list = clusters.get(root) ?? [];
    list.push(i);
    clusters.set(root, list);
  });

  const plans: ProviderMergePlan[] = [];
  for (const members of clusters.values()) {
    if (members.length < 2) continue;
    const sorted = [...members].sort((a, b) => {
      // Active first, then lowest ULID.
      if (rows[a].isActive !== rows[b].isActive) return rows[a].isActive ? -1 : 1;
      return rows[a].id < rows[b].id ? -1 : 1;
    });
    const survivor = rows[sorted[0]].id;
    const losers = sorted.slice(1).map((i) => rows[i].id).sort();
    plans.push({ survivorId: survivor, loserIds: losers });
  }
  return plans.sort((a, b) => (a.survivorId < b.survivorId ? -1 : 1));
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `export PATH="/c/Users/rahma/.bun/bin:$PATH" && cd packages/shared && bunx vitest run src/provider-dedup.spec.ts`
Expected: PASS (all describe blocks).

- [x] **Step 5: Commit**

```bash
git add packages/shared/src/provider-dedup.ts packages/shared/src/provider-dedup.spec.ts
git commit -m "feat(provider-uniqueness): add union-find provider merge planner"
```

---

### Task 3: Create pre-check + 409 in ProvidersService

**Files:**
- Modify: `apps/api/src/providers/providers.service.ts`
- Test: `apps/api/src/providers/providers.service.int.spec.ts`

**Interfaces:**
- Consumes: `normalizeProviderName`, `normalizePpiu` from `@cometkit/shared`; `TenantScopedDb.select(table, extraWhere)` (auto tenant-scoped).
- Produces: `create()` throws `ConflictException` on a name or PPIU collision within the tenant; stores normalized (blank→null) `ppiuLicenseNo`; a DB unique-violation (`code 23505`) is mapped to the same `ConflictException`.

- [x] **Step 1: Write the failing test** (append a new `it` to the existing integration describe block; reuse its `service`, `createdIds`, `suffix`)

```ts
// add these imports at the top of providers.service.int.spec.ts
import { ConflictException } from "@nestjs/common";

// add inside describe("ProvidersService (integration)", ...)
it("rejects a create whose normalized name duplicates an existing provider", async () => {
  const base = {
    brandName: "Dup Co", contactPerson: "A", contactPhone: "628111",
    accreditation: "A" as const, defaultCommissionType: "flat_per_pax" as const,
    defaultCommissionValue: 0,
  };
  const first = await service.create({ ...base, name: `PT Dup ${suffix}` });
  createdIds.push(first.id);

  await expect(
    service.create({ ...base, name: `  pt dup ${suffix}  ` }), // case/space variant
  ).rejects.toBeInstanceOf(ConflictException);
});

it("rejects a create whose normalized PPIU duplicates, and stores blank PPIU as null", async () => {
  const base = {
    brandName: "Ppiu Co", contactPerson: "A", contactPhone: "628111",
    accreditation: "A" as const, defaultCommissionType: "flat_per_pax" as const,
    defaultCommissionValue: 0,
  };
  const withPpiu = await service.create({ ...base, name: `PPIU One ${suffix}`, ppiuLicenseNo: `LIC-${suffix}` });
  createdIds.push(withPpiu.id);

  await expect(
    service.create({ ...base, name: `PPIU Two ${suffix}`, ppiuLicenseNo: `  LIC-${suffix}  ` }),
  ).rejects.toBeInstanceOf(ConflictException);

  const blank = await service.create({ ...base, name: `PPIU Blank ${suffix}`, ppiuLicenseNo: "   " });
  createdIds.push(blank.id);
  expect(blank.ppiuLicenseNo).toBeNull();
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `export PATH="/c/Users/rahma/.bun/bin:$PATH" && cd apps/api && bun run test:int -- providers.service.int`
Expected: FAIL — second create succeeds (no conflict thrown) / blank stored as `"   "` not null.
(If Postgres/seed not available, note it and run after Task 7's migrate+seed.)

- [x] **Step 3: Write minimal implementation** — replace the `create` method and add a private helper. Add imports.

```ts
// top of providers.service.ts — extend the @nestjs/common import
import { Inject, Injectable, NotFoundException, BadRequestException, ConflictException } from "@nestjs/common";
// extend the drizzle-orm import
import { and, desc, eq, ne, or, isNotNull, sql, type SQL } from "drizzle-orm";
// add shared import
import { normalizeProviderName, normalizePpiu } from "@cometkit/shared";
```

```ts
// add as a private method on ProvidersService
/** Throws ConflictException if name or PPIU collides within the tenant. `excludeId` skips self on update. */
private async assertNoConflict(
  name: string | undefined,
  ppiu: string | null,
  excludeId?: string,
): Promise<void> {
  const clauses: SQL[] = [];
  if (name !== undefined) clauses.push(eq(sql`lower(trim(${providers.name}))`, normalizeProviderName(name)));
  if (ppiu !== null) clauses.push(and(isNotNull(providers.ppiuLicenseNo), eq(sql`trim(${providers.ppiuLicenseNo})`, ppiu)) as SQL);
  if (clauses.length === 0) return;

  const match = or(...clauses) as SQL;
  const where = excludeId ? (and(ne(providers.id, excludeId), match) as SQL) : match;
  const [existing] = await this.db.select(providers, where);
  if (existing) {
    throw new ConflictException(
      `A provider with the same name or PPIU license already exists (id ${(existing as { id: string }).id})`,
    );
  }
}

/** postgres-js unique-violation → 409, as a concurrency backstop for the pre-check. */
private isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "23505";
}
```

```ts
// replace create()
async create(input: CreateProviderInput): Promise<Provider> {
  const id = ulid();
  const ppiu = normalizePpiu(input.ppiuLicenseNo);
  await this.assertNoConflict(input.name, ppiu);
  try {
    const [row] = await this.db.insertValues(providers, {
      id,
      name: input.name,
      brandName: input.brandName,
      ppiuLicenseNo: ppiu,
      pihkLicenseNo: input.pihkLicenseNo ?? null,
      accreditation: input.accreditation ?? "unknown",
      contactPerson: input.contactPerson,
      contactPhone: input.contactPhone,
      logoUrl: input.logoUrl ?? null,
      allowLogoOnPublicPages: input.allowLogoOnPublicPages ?? false,
      defaultCommissionType: input.defaultCommissionType ?? "flat_per_pax",
      defaultCommissionValue: input.defaultCommissionValue ?? 0,
      commissionNotes: input.commissionNotes ?? null,
      isActive: false,
      pricePublicationConsentAt: null,
    });
    if (!row) throw new Error("Insert returned no row");
    this.logger.info({ providerId: id }, "provider.created");
    return row as Provider;
  } catch (err) {
    if (this.isUniqueViolation(err)) {
      throw new ConflictException("A provider with the same name or PPIU license already exists");
    }
    throw err;
  }
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `export PATH="/c/Users/rahma/.bun/bin:$PATH" && cd apps/api && bun run test:int -- providers.service.int`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add apps/api/src/providers/providers.service.ts apps/api/src/providers/providers.service.int.spec.ts
git commit -m "feat(provider-uniqueness): 409 conflict pre-check on provider create"
```

---

### Task 4: Update pre-check + 409 in ProvidersService

**Files:**
- Modify: `apps/api/src/providers/providers.service.ts`
- Test: `apps/api/src/providers/providers.service.int.spec.ts`

**Interfaces:**
- Consumes: `assertNoConflict`, `isUniqueViolation`, `normalizePpiu` (Task 3).
- Produces: `update()` normalizes PPIU, rejects a change that collides with another provider (excluding self) via `ConflictException`.

- [x] **Step 1: Write the failing test**

```ts
// add inside describe("ProvidersService (integration)", ...)
it("rejects an update whose normalized name collides with another provider", async () => {
  const base = {
    brandName: "Upd Co", contactPerson: "A", contactPhone: "628111",
    accreditation: "A" as const, defaultCommissionType: "flat_per_pax" as const,
    defaultCommissionValue: 0,
  };
  const a = await service.create({ ...base, name: `Upd A ${suffix}` });
  const b = await service.create({ ...base, name: `Upd B ${suffix}` });
  createdIds.push(a.id, b.id);

  // rename B onto A's normalized name
  await expect(service.update(b.id, { name: ` upd a ${suffix} ` })).rejects.toBeInstanceOf(ConflictException);

  // renaming B to itself (same normalized name) must NOT conflict (self excluded)
  const ok = await service.update(b.id, { name: `Upd B ${suffix}`, contactPhone: "628999" });
  expect(ok.contactPhone).toBe("628999");
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `export PATH="/c/Users/rahma/.bun/bin:$PATH" && cd apps/api && bun run test:int -- providers.service.int`
Expected: FAIL — update does not pre-check; collision update succeeds.

- [x] **Step 3: Write minimal implementation** — replace `update()`

```ts
async update(id: string, input: UpdateProviderInput): Promise<Provider> {
  const ppiu = "ppiuLicenseNo" in input ? normalizePpiu(input.ppiuLicenseNo) : null;
  await this.assertNoConflict(input.name, ppiu, id);
  const set: Record<string, unknown> = { ...input };
  if ("ppiuLicenseNo" in input) set.ppiuLicenseNo = ppiu;
  try {
    const [row] = await this.db.update(providers, set, eq(providers.id, id));
    if (!row) throw new NotFoundException("Provider not found");
    this.logger.info({ providerId: id }, "provider.updated");
    return row as Provider;
  } catch (err) {
    if (this.isUniqueViolation(err)) {
      throw new ConflictException("A provider with the same name or PPIU license already exists");
    }
    throw err;
  }
}
```

Note: `assertNoConflict` only checks PPIU when the caller passed a non-null normalized value, so an update that omits `ppiuLicenseNo` is not blocked by an unrelated provider's PPIU.

- [x] **Step 4: Run test to verify it passes**

Run: `export PATH="/c/Users/rahma/.bun/bin:$PATH" && cd apps/api && bun run test:int -- providers.service.int`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add apps/api/src/providers/providers.service.ts apps/api/src/providers/providers.service.int.spec.ts
git commit -m "feat(provider-uniqueness): 409 conflict pre-check on provider update"
```

---

### Task 5: Dedup script — apply + orchestrate (packages/db)

**Files:**
- Create: `packages/db/src/scripts/dedup-providers.ts`
- Modify: `packages/db/src/index.ts` (export the module), `packages/db/package.json` (add `db:dedup-providers` script + `@cometkit/shared` is already a dep)
- Test: `apps/api/src/providers/dedup-providers.int.spec.ts`

**Interfaces:**
- Consumes: `planProviderMerges`, `normalizePpiu`, `ProviderMergePlan` from `@cometkit/shared`; `Database`, `providers`, `packages` from the db package.
- Produces:
  - `applyProviderMerges(db: Database, plans: ProviderMergePlan[]): Promise<{ repointed: number; deleted: number }>` — in ONE transaction, repoints `packages.provider_id` losers→survivor and deletes losers.
  - `dedupeProviders(db: Database): Promise<ProviderMergePlan[]>` — normalizes blank PPIUs → null, loads all providers, groups by `tenantId`, plans per tenant, applies, logs each merge, returns the plans.

  Because the unique indexes forbid inserting real duplicate rows, the integration test exercises `applyProviderMerges` with DISTINCT rows plus a hand-built plan (mechanics), and the blank-PPIU normalization separately. Cluster logic itself is unit-covered in Task 2.

- [x] **Step 1: Write the failing test**

```ts
// apps/api/src/providers/dedup-providers.int.spec.ts
import { config } from "dotenv";
import { resolve } from "node:path";
import { ulid } from "ulid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import { createDb, tenants, providers, packages, applyProviderMerges, dedupeProviders, type Database } from "@cometkit/db";
import { DEFAULT_TENANT_SLUG } from "@cometkit/shared";

config({ path: resolve(__dirname, "../../../../.env") });

describe("dedupeProviders (integration)", () => {
  let db: Database;
  let tenantId: string;
  const providerIds: string[] = [];
  const packageIds: string[] = [];
  const suffix = ulid().toLowerCase();

  beforeAll(async () => {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL required");
    db = createDb(url);
    const [t] = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, DEFAULT_TENANT_SLUG));
    if (!t) throw new Error("Default tenant not seeded - run bun run db:seed first");
    tenantId = t.id;
  });

  afterAll(async () => {
    if (packageIds.length) await db.delete(packages).where(inArray(packages.id, packageIds));
    if (providerIds.length) await db.delete(providers).where(inArray(providers.id, providerIds));
  });

  it("repoints packages and deletes losers for a hand-built plan", async () => {
    const survivor = ulid();
    const loser = ulid();
    providerIds.push(survivor, loser);
    const baseProv = {
      tenantId, brandName: "b", contactPerson: "c", contactPhone: "628",
      accreditation: "unknown" as const, defaultCommissionType: "flat_per_pax" as const,
    };
    await db.insert(providers).values([
      { ...baseProv, id: survivor, name: `Survivor ${suffix}` },
      { ...baseProv, id: loser, name: `Loser ${suffix}` },
    ]);
    const pkgId = ulid();
    packageIds.push(pkgId);
    await db.insert(packages).values({
      id: pkgId, tenantId, providerId: loser, title: `P ${suffix}`, slug: `p-${suffix}`,
    });

    const res = await applyProviderMerges(db, [{ survivorId: survivor, loserIds: [loser] }]);
    expect(res).toEqual({ repointed: 1, deleted: 1 });

    const [pkg] = await db.select({ providerId: packages.providerId }).from(packages).where(eq(packages.id, pkgId));
    expect(pkg.providerId).toBe(survivor); // repointed
    const remaining = await db.select({ id: providers.id }).from(providers).where(inArray(providers.id, [survivor, loser]));
    expect(remaining.map((r) => r.id)).toEqual([survivor]); // loser deleted
  });

  it("normalizes a blank PPIU to null", async () => {
    const id = ulid();
    providerIds.push(id);
    await db.insert(providers).values({
      tenantId, id, name: `Blank ${suffix}`, brandName: "b", contactPerson: "c", contactPhone: "628",
      accreditation: "unknown", defaultCommissionType: "flat_per_pax", ppiuLicenseNo: "   ",
    });
    await dedupeProviders(db);
    const [row] = await db.select({ ppiu: providers.ppiuLicenseNo }).from(providers).where(eq(providers.id, id));
    expect(row.ppiu).toBeNull();
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `export PATH="/c/Users/rahma/.bun/bin:$PATH" && cd apps/api && bun run test:int -- dedup-providers.int`
Expected: FAIL — `applyProviderMerges`/`dedupeProviders` not exported from `@cometkit/db`.

- [x] **Step 3: Write minimal implementation**

```ts
// packages/db/src/scripts/dedup-providers.ts
import { inArray, sql } from "drizzle-orm";
import { normalizePpiu, planProviderMerges, type ProviderMergeInput, type ProviderMergePlan } from "@cometkit/shared";
import { databaseUrl } from "../../env";
import { createDb, type Database } from "../index";
import { providers, packages } from "../schema";

/** Repoint packages loser→survivor and delete losers, all in one transaction. */
export async function applyProviderMerges(
  db: Database,
  plans: ProviderMergePlan[],
): Promise<{ repointed: number; deleted: number }> {
  let repointed = 0;
  let deleted = 0;
  await db.transaction(async (tx) => {
    for (const plan of plans) {
      if (plan.loserIds.length === 0) continue;
      const rp = await tx
        .update(packages)
        .set({ providerId: plan.survivorId })
        .where(inArray(packages.providerId, plan.loserIds))
        .returning({ id: packages.id });
      repointed += rp.length;
      const del = await tx.delete(providers).where(inArray(providers.id, plan.loserIds)).returning({ id: providers.id });
      deleted += del.length;
    }
  });
  return { repointed, deleted };
}

/** One-time cleanup: normalize blank PPIUs, cluster per tenant, apply merges. */
export async function dedupeProviders(db: Database): Promise<ProviderMergePlan[]> {
  // 1. Blank/whitespace PPIU -> NULL so blanks are exempt from uniqueness.
  await db.update(providers).set({ ppiuLicenseNo: null }).where(sql`btrim(${providers.ppiuLicenseNo}) = ''`);

  // 2. Load all providers, group by tenant.
  const rows = await db
    .select({
      id: providers.id, tenantId: providers.tenantId, name: providers.name,
      ppiuLicenseNo: providers.ppiuLicenseNo, isActive: providers.isActive,
    })
    .from(providers);

  const byTenant = new Map<string, ProviderMergeInput[]>();
  for (const r of rows) {
    const list = byTenant.get(r.tenantId) ?? [];
    list.push({ id: r.id, name: r.name, ppiuLicenseNo: normalizePpiu(r.ppiuLicenseNo), isActive: r.isActive });
    byTenant.set(r.tenantId, list);
  }

  // 3. Plan + apply per tenant.
  const allPlans: ProviderMergePlan[] = [];
  for (const [tenantId, list] of byTenant) {
    const plans = planProviderMerges(list);
    if (plans.length === 0) continue;
    const res = await applyProviderMerges(db, plans);
    for (const p of plans) {
      // eslint-disable-next-line no-console
      console.log(JSON.stringify({ event: "provider.merged", tenantId, survivorId: p.survivorId, loserIds: p.loserIds }));
    }
    console.log(JSON.stringify({ event: "provider.dedup.tenant", tenantId, ...res }));
    allPlans.push(...plans);
  }
  return allPlans;
}

// CLI entry — run via `bun src/scripts/dedup-providers.ts`.
if (import.meta.main) {
  const db = createDb(databaseUrl);
  dedupeProviders(db)
    .then((plans) => {
      console.log(JSON.stringify({ event: "provider.dedup.done", clusters: plans.length }));
      process.exit(0);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
```

- [x] **Step 4: Export from the db barrel and add a package script**

```ts
// packages/db/src/index.ts — add near the other exports
export * from "./scripts/dedup-providers";
```

```jsonc
// packages/db/package.json — add to "scripts"
"db:dedup-providers": "bun src/scripts/dedup-providers.ts",
```

- [x] **Step 5: Run test to verify it passes**

Run: `export PATH="/c/Users/rahma/.bun/bin:$PATH" && cd apps/api && bun run test:int -- dedup-providers.int`
Expected: PASS (both cases).

- [x] **Step 6: Commit**

```bash
git add packages/db/src/scripts/dedup-providers.ts packages/db/src/index.ts packages/db/package.json apps/api/src/providers/dedup-providers.int.spec.ts
git commit -m "feat(provider-uniqueness): one-time dedup-providers merge script"
```

---

### Task 6: Per-tenant unique indexes (schema + migration)

**Files:**
- Modify: `packages/db/src/schema/providers.ts`
- Create: a generated migration under `packages/db/drizzle/` (hand-verified)
- Test: `apps/api/src/providers/providers-unique-index.int.spec.ts`

**Interfaces:**
- Consumes: existing `providers` table.
- Produces: `providers_tenant_name_unique` on `(tenant_id, lower(trim(name)))`; `providers_tenant_ppiu_unique` on `(tenant_id, trim(ppiu_license_no)) WHERE ppiu_license_no IS NOT NULL`.

- [x] **Step 1: Write the failing test**

```ts
// apps/api/src/providers/providers-unique-index.int.spec.ts
import { config } from "dotenv";
import { resolve } from "node:path";
import { ulid } from "ulid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { createDb, tenants, providers, type Database } from "@cometkit/db";
import { DEFAULT_TENANT_SLUG } from "@cometkit/shared";

config({ path: resolve(__dirname, "../../../../.env") });

describe("provider unique indexes (integration)", () => {
  let db: Database;
  let tenantId: string;
  const ids: string[] = [];
  const suffix = ulid().toLowerCase();
  const base = () => ({
    tenantId, brandName: "b", contactPerson: "c", contactPhone: "628",
    accreditation: "unknown" as const, defaultCommissionType: "flat_per_pax" as const,
  });

  beforeAll(async () => {
    db = createDb(process.env.DATABASE_URL!);
    const [t] = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, DEFAULT_TENANT_SLUG));
    tenantId = t!.id;
  });
  afterAll(async () => { if (ids.length) await db.delete(providers).where(inArray(providers.id, ids)); });

  it("rejects a direct duplicate normalized-name insert", async () => {
    const a = ulid(); ids.push(a);
    await db.insert(providers).values({ ...base(), id: a, name: `Idx ${suffix}` });
    const b = ulid(); ids.push(b);
    await expect(
      db.insert(providers).values({ ...base(), id: b, name: ` idx ${suffix} ` }),
    ).rejects.toMatchObject({ code: "23505" });
  });

  it("allows multiple blank-PPIU rows and same value across nothing here (single tenant)", async () => {
    const a = ulid(), b = ulid(); ids.push(a, b);
    await db.insert(providers).values({ ...base(), id: a, name: `Blank1 ${suffix}`, ppiuLicenseNo: null });
    await expect(
      db.insert(providers).values({ ...base(), id: b, name: `Blank2 ${suffix}`, ppiuLicenseNo: null }),
    ).resolves.toBeDefined(); // null PPIUs do not collide
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `export PATH="/c/Users/rahma/.bun/bin:$PATH" && cd apps/api && bun run test:int -- providers-unique-index.int`
Expected: FAIL — duplicate name insert succeeds (no index yet).

- [x] **Step 3: Add indexes to the schema**

```ts
// packages/db/src/schema/providers.ts
// extend the drizzle-orm/pg-core import to include uniqueIndex
import { boolean, integer, pgEnum, pgTable, text, varchar, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
// add sql import
import { sql } from "drizzle-orm";
```

```ts
// convert the providers table's third argument into an index list
export const providers = pgTable("providers", {
  // ... existing columns unchanged ...
}, (t) => [
  uniqueIndex("providers_tenant_name_unique").on(t.tenantId, sql`lower(btrim(${t.name}))`),
  uniqueIndex("providers_tenant_ppiu_unique")
    .on(t.tenantId, sql`btrim(${t.ppiuLicenseNo})`)
    .where(sql`${t.ppiuLicenseNo} is not null`),
]);
```

- [x] **Step 4: Generate and hand-verify the migration**

Run: `export PATH="/c/Users/rahma/.bun/bin:$PATH" && cd packages/db && bunx drizzle-kit generate`
Then open the new `packages/db/drizzle/00NN_*.sql` and confirm it contains (edit by hand to match if drizzle emits column-only indexes):

```sql
CREATE UNIQUE INDEX "providers_tenant_name_unique" ON "providers" ("tenant_id", lower(btrim("name")));
CREATE UNIQUE INDEX "providers_tenant_ppiu_unique" ON "providers" ("tenant_id", btrim("ppiu_license_no")) WHERE "ppiu_license_no" IS NOT NULL;
```

- [x] **Step 5: Apply and run the test**

Run:
```
export PATH="/c/Users/rahma/.bun/bin:$PATH"
cd /c/Sobari/Ai/tawaf-sai/e-tawafsai && bun run db:migrate
cd apps/api && bun run test:int -- providers-unique-index.int
```
Expected: migrate applies clean; test PASSES.
If migrate fails because the dev DB already holds duplicates, run `bun packages/db/src/scripts/dedup-providers.ts` first (the documented runbook order), then re-run migrate.

- [x] **Step 6: Commit**

```bash
git add packages/db/src/schema/providers.ts packages/db/drizzle/ apps/api/src/providers/providers-unique-index.int.spec.ts
git commit -m "feat(provider-uniqueness): per-tenant unique indexes on name and PPIU"
```

---

### Task 7: Full verification

**Files:** none (verification only).

- [x] **Step 1: Dedup then migrate on a real DB**

Run:
```
export PATH="/c/Users/rahma/.bun/bin:$PATH"
cd /c/Sobari/Ai/tawaf-sai/e-tawafsai
bun packages/db/src/scripts/dedup-providers.ts   # cleans any existing duplicates
bun run db:migrate                                # applies unique indexes
bun run db:seed                                   # ensure default tenant/accounts
```
Expected: dedup logs (or a no-op), migrate applies, seed idempotent.

- [x] **Step 2: Run the quality gate**

Run: `export PATH="/c/Users/rahma/.bun/bin:$PATH" && cd /c/Sobari/Ai/tawaf-sai/e-tawafsai && bun run verify`
Expected: typecheck + lint + test all PASS.

- [x] **Step 3: Run provider integration specs**

Run: `export PATH="/c/Users/rahma/.bun/bin:$PATH" && cd apps/api && bun run test:int -- providers`
Expected: service, dedup, and unique-index int specs PASS.

- [x] **Step 4: Commit any lockfile/config touch-ups (if generated)**

```bash
git add -A && git commit -m "chore(provider-uniqueness): verification pass" || echo "nothing to commit"
```
