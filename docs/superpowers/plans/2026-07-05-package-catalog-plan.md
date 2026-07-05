---
change: package-catalog
design-doc: docs/superpowers/specs/2026-07-05-package-catalog-design.md
base-ref: a1c3a6f41da1c4d81a76f6367715a26ae47104f4
---

# Package Catalog (C3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a tenant-scoped Package Catalog registry with one-to-many city hotels, tag-based inclusions, optional flyer uploads, slug generation, and active provider publish validation.

**Architecture:** Use shared contracts for validation, Drizzle tables for storage, NestJS service endpoints with policy-driven publish gates, and Next.js Web UI forms.

**Tech Stack:** Next.js, Fastify, NestJS, Drizzle ORM, Zod, TanStack Query.

## Global Constraints
- TypeScript 6 nodules resolved explicitly.
- Zod 4 schemas and inferred validation types.
- API validation uses ZodValidationPipe on body payloads.
- Database access scoped to active tenant context.

---

### Task 1: Shared Schema Contracts & Validation

**Files:**
- Create: `packages/shared/src/packages.ts`
- Modify: `packages/shared/src/index.ts`
- Test: `packages/shared/src/packages.spec.ts`

**Interfaces:**
- Produces: `CreatePackageInput`, `UpdatePackageInput`, `PackageDto`, `StaffPackageDto` types.

- [ ] **Step 1: Write the failing test**
  Write `packages/shared/src/packages.spec.ts` asserting that schemas parse correct objects and catch validation errors:
  ```ts
  import { describe, expect, it } from "vitest";
  import { createPackageSchema } from "./packages";

  describe("Package schema validation", () => {
    it("validates create payload", () => {
      const parsed = createPackageSchema.safeParse({
        title: "Umrah Regular 9 Days",
        providerId: "01H...",
        productType: "umrah",
      });
      expect(parsed.success).toBe(true);
    });
  });
  ```

- [ ] **Step 2: Run test to verify it fails**
  Run: `bun run test packages.spec` in `packages/shared`
  Expected: FAIL with "Cannot find module './packages'"

- [ ] **Step 3: Write minimal implementation**
  Create `packages/shared/src/packages.ts`:
  ```ts
  import * as z from "zod";

  export const PRODUCT_TYPES = ["umrah", "haji_khusus", "haji_furoda"] as const;
  export const PACKAGE_CATEGORIES = ["regular", "plus", "private_vip", "ramadan", "arbain", "other"] as const;
  export const PACKAGE_STATUSES = ["draft", "published", "archived"] as const;

  export const createPackageSchema = z.object({
    title: z.string().min(1).max(255),
    providerId: z.string().length(26),
    productType: z.enum(PRODUCT_TYPES).default("umrah"),
    category: z.enum(PACKAGE_CATEGORIES).default("regular"),
    plusDestination: z.string().max(120).nullable().optional(),
    durationDays: z.number().int().positive().nullable().optional(),
    description: z.string().nullable().optional(),
    airline: z.string().max(120).nullable().optional(),
    flightRoute: z.string().max(255).nullable().optional(),
    departureCity: z.string().max(120).nullable().optional(),
    isFeatured: z.boolean().default(false),
  });

  export const updatePackageSchema = createPackageSchema.partial();

  export type CreatePackageInput = z.input<typeof createPackageSchema>;
  export type UpdatePackageInput = z.input<typeof updatePackageSchema>;

  export interface HotelInput {
    cityName: string;
    name: string;
    stars: number;
    distanceM?: number | null;
    isPelataran: boolean;
  }

  export interface PackageDto {
    id: string;
    tenantId: string;
    providerId: string;
    productType: string;
    title: string;
    slug: string;
    category: string;
    plusDestination: string | null;
    durationDays: number | null;
    description: string | null;
    airline: string | null;
    flightRoute: string | null;
    departureCity: string | null;
    isFeatured: boolean;
    status: string;
    hotels: HotelInput[];
    tags: string[];
    flyers: string[];
    createdAt: string;
    updatedAt: string;
  }

  export type StaffPackageDto = PackageDto;
  ```
  Modify `packages/shared/src/index.ts` to export `./packages`.

- [ ] **Step 4: Run test to verify it passes**
  Run: `bun run test packages.spec` in `packages/shared`
  Expected: PASS

- [ ] **Step 5: Commit**
  ```bash
  git add packages/shared/src/packages.ts packages/shared/src/packages.spec.ts packages/shared/src/index.ts
  git commit -m "feat(package-catalog): create shared package schemas and dtos"
  ```

---

### Task 2: Database Schema & Seeding

**Files:**
- Create: `packages/db/src/schema/packages.ts`
- Modify: `packages/db/src/schema/index.ts`
- Modify: `packages/db/src/seed.ts`

- [ ] **Step 1: Write the failing test**
  Create `apps/api/src/packages/packages.service.int.spec.ts` asserting the packages schema matches DB columns:
  ```ts
  import { describe, expect, it } from "vitest";
  import { packages } from "@cometkit/db";

  describe("Packages DB Schema", () => {
    it("exports packages table definition", () => {
      expect(packages.title).toBeDefined();
    });
  });
  ```

- [ ] **Step 2: Run test to verify it fails**
  Run: `bun run test:int packages.service.int.spec` in `apps/api`
  Expected: FAIL (packages table not defined/exported from @cometkit/db)

- [ ] **Step 3: Write minimal implementation**
  Create `packages/db/src/schema/packages.ts` defining `packages`, `packageHotels`, `tags`, `packageTags`, and `packageFlyers`.
  Export everything from `packages/db/src/schema/index.ts`.
  Update seed script `packages/db/src/seed.ts` to populate default inclusion tags.

- [ ] **Step 4: Run test to verify it passes**
  Run migrations:
  `bun run db:generate`
  `bun run db:migrate`
  `bun run db:seed`
  Run test: `bun run test:int packages.service.int.spec` in `apps/api`
  Expected: PASS

- [ ] **Step 5: Commit**
  ```bash
  git add packages/db/src/schema/packages.ts packages/db/src/schema/index.ts packages/db/src/seed.ts packages/db/drizzle/
  git commit -m "feat(package-catalog): create package catalog tables and seeding"
  ```

---

### Task 3: Slug Service & API CRUD

**Files:**
- Create: `apps/api/src/packages/packages.policy.ts`
- Create: `apps/api/src/packages/packages.service.ts`
- Create: `apps/api/src/packages/packages.controller.ts`
- Create: `apps/api/src/packages/packages.module.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1: Write the failing test**
  Add unit tests in `apps/api/src/packages/packages.service.int.spec.ts` testing publish validation (blocked without Makkah hotel or inactive provider) and slug collisions.

- [ ] **Step 2: Run test to verify it fails**
  Run: `bun run test:int packages.service.int.spec`
  Expected: FAIL (controllers/services not found)

- [ ] **Step 3: Write minimal implementation**
  Implement `packages.policy.ts` (validation rules), `packages.service.ts` (handling CRUD + transaction-wrapped cascade unpublishes), and `packages.controller.ts`.
  Register `PackagesModule` in `app.module.ts`.

- [ ] **Step 4: Run test to verify it passes**
  Run: `bun run test:int packages.service.int.spec`
  Expected: PASS

- [ ] **Step 5: Commit**
  ```bash
  git add apps/api/src/packages/ apps/api/src/app.module.ts
  git commit -m "feat(package-catalog): implement packages endpoints and validation policy"
  ```

---

### Task 4: Web UI Catalog Registry

**Files:**
- Create: `apps/web/src/hooks/use-packages.ts`
- Create: `apps/web/src/app/dashboard/packages/page.tsx`
- Modify: `apps/web/src/app/dashboard/page.tsx`

- [ ] **Step 1: Write the hook & registry page**
  Implement TanStack query hooks in `use-packages.ts` and catalog table layout in `page.tsx` showing status tags. Link registry page in dashboard.

- [ ] **Step 2: Verify lint and compilation**
  Run: `bun run verify` in workspace root.
  Expected: PASS

- [ ] **Step 3: Commit**
  ```bash
  git add apps/web/src/hooks/use-packages.ts apps/web/src/app/dashboard/packages/page.tsx apps/web/src/app/dashboard/page.tsx
  git commit -m "feat(package-catalog): implement Web UI package registry view"
  ```

---

### Task 5: Web UI Package Edit/Create Form

**Files:**
- Create: `apps/web/src/app/dashboard/packages/[id]/page.tsx`

- [ ] **Step 1: Write the forms page**
  Implement form rendering side-by-side with optional flyer upload component, dynamic hotel city entries, and tags multiselect. Surfacing publish failures.

- [ ] **Step 2: Verify lint and compilation**
  Run: `bun run verify` in workspace root.
  Expected: PASS

- [ ] **Step 3: Commit**
  ```bash
  git add apps/web/src/app/dashboard/packages/[id]/page.tsx
  git commit -m "feat(package-catalog): build Web UI create/edit package form"
  ```
