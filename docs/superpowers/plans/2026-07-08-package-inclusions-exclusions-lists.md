---
change: package-inclusions-exclusions-lists
design-doc: docs/superpowers/specs/2026-07-08-package-inclusions-exclusions-lists-design.md
base-ref: 0923ece4f270b6ac47b7412f9edd6efc6f7117b4
---

# Package Inclusions and Exclusions Catalogs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the unstructured package tag list into distinct Package Inclusions and Package Exclusions tenant-global master catalogs, with CRUD management interfaces and separate multi-select pill button sections on the package form.

**Architecture:** Database schema updates to introduce `inclusions`, `exclusions` and their link tables while removing `tags` and `package_tags`. Implement backend REST CRUD APIs with name uniqueness and delete protection, updating `PackagesService` to write links atomically using transactions. Update frontend React hooks, Settings master-data, and Package forms.

**Tech Stack:** TypeScript, Drizzle ORM, NestJS, Next.js, TanStack Query, Tailwind CSS.

## Global Constraints
- Target workspace: `c:\Sobari\Ai\tawaf-sai\e-tawafsai`
- Database schema and migrations must pass build check without TS errors.
- Any deletion of in-use master items must be blocked with a 409 Conflict.
- Form submissions must update link relations atomically inside database transactions.
- Quality gates (`bun run verify`) must pass completely at the end.

---

## 1. Database Schema & Migration

### Task 1: Drizzle Schema Modification
**Files:**
- Modify: `packages/db/src/schema/packages.ts`
- Modify: `packages/db/src/seed.ts`

- [ ] **Step 1.1**: Open [packages.ts](file:///c:/Sobari/Ai/tawaf-sai/e-tawafsai/packages/db/src/schema/packages.ts). Remove definitions for `tags` and `packageTags` (and their exports).
- [ ] **Step 1.2**: Add definitions and exports for `inclusions`, `exclusions`, `packageInclusions`, and `packageExclusions` tables, along with their unique indices.
- [ ] **Step 1.3**: Open [seed.ts](file:///c:/Sobari/Ai/tawaf-sai/e-tawafsai/packages/db/src/seed.ts). Update the seed logic to populate default inclusions and exclusions.
- [ ] **Step 1.4**: Run `bun run db:generate` to generate Drizzle SQL migrations.
- [ ] **Step 1.5**: Run `bun run db:migrate` to apply migrations to local Postgres instance.
- [ ] **Step 1.6**: Run `bun run db:seed` to seed default lists.
- [ ] **Step 1.7**: Verify database migration by inspecting tables in Postgres or using git status, then commit.
```bash
git add packages/db/src/schema/packages.ts packages/db/src/seed.ts
git commit -m "db: update schema to replace tags with inclusions and exclusions"
```

---

## 2. Shared Types & Schemas

### Task 2: Update Shared Schemas
**Files:**
- Modify: `packages/shared/src/packages.ts`

- [ ] **Step 2.1**: Define interfaces `PackageInclusionDto` and `PackageExclusionDto`.
- [ ] **Step 2.2**: Update `PackageDto` to replace `tags: string[]` with `inclusions: PackageInclusionDto[]` and `exclusions: PackageExclusionDto[]`.
- [ ] **Step 2.3**: Update `createPackageSchema` to add optional fields `inclusions: z.array(z.string().length(26)).optional()` and `exclusions: z.array(z.string().length(26)).optional()`.
- [ ] **Step 2.4**: Define CRUD schemas `createInclusionSchema`, `updateInclusionSchema`, `createExclusionSchema`, `updateExclusionSchema`.
- [ ] **Step 2.5**: Run typecheck across the workspace (`bun run typecheck`) to verify shared changes are visible, and commit.
```bash
git add packages/shared/src/packages.ts
git commit -m "shared: update package schemas and DTOs for inclusions/exclusions"
```

---

## 3. Backend API Implementation

### Task 3: Inclusions and Exclusions API
**Files:**
- Create: `apps/api/src/inclusions/inclusions.policy.ts`
- Create: `apps/api/src/inclusions/inclusions.service.ts`
- Create: `apps/api/src/inclusions/inclusions.controller.ts`
- Create: `apps/api/src/inclusions/inclusions.module.ts`
- Create: `apps/api/src/exclusions/exclusions.policy.ts`
- Create: `apps/api/src/exclusions/exclusions.service.ts`
- Create: `apps/api/src/exclusions/exclusions.controller.ts`
- Create: `apps/api/src/exclusions/exclusions.module.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 3.1**: Implement `InclusionsPolicy` with a name-normalization helper.
- [ ] **Step 3.2**: Implement `InclusionsService` with CRUD operations and a count-based delete guard on `packageInclusions`.
- [ ] **Step 3.3**: Implement `InclusionsController` exposing `/inclusions` and protecting write paths with `@Roles("admin")`.
- [ ] **Step 3.4**: Implement `InclusionsModule`.
- [ ] **Step 3.5**: Replicate the above steps for `exclusions` policy, service, controller, and module under `apps/api/src/exclusions`.
- [ ] **Step 3.6**: Register both `InclusionsModule` and `ExclusionsModule` in [app.module.ts](file:///c:/Sobari/Ai/tawaf-sai/e-tawafsai/apps/api/src/app.module.ts).
- [ ] **Step 3.7**: Verify backend files compile successfully, then commit.
```bash
git add apps/api/src/inclusions apps/api/src/exclusions apps/api/src/app.module.ts
git commit -m "feat(api): implement CRUD endpoints for inclusions and exclusions"
```

### Task 4: API Packages Service Updates
**Files:**
- Modify: `apps/api/src/packages/packages.service.ts`
- Modify: `apps/api/src/packages/packages.controller.ts`

- [ ] **Step 4.1**: Update `findOne` in [packages.service.ts](file:///c:/Sobari/Ai/tawaf-sai/e-tawafsai/apps/api/src/packages/packages.service.ts) to retrieve linked inclusions and exclusions, and remove the tags query.
- [ ] **Step 4.2**: Update `create` in `packages.service.ts` to insert `packageInclusions` and `packageExclusions` links inside a database transaction block.
- [ ] **Step 4.3**: Update `update` in `packages.service.ts` to sync relations inside a database transaction (deleting old links and inserting new ones).
- [ ] **Step 4.4**: Update [packages.controller.ts](file:///c:/Sobari/Ai/tawaf-sai/e-tawafsai/apps/api/src/packages/packages.controller.ts) to remove legacy `/tags` endpoints.
- [ ] **Step 4.5**: Run backend integration tests or verify the backend builds, then commit.
```bash
git add apps/api/src/packages/packages.service.ts apps/api/src/packages/packages.controller.ts
git commit -m "feat(api): update packages service and controller for relational inclusions/exclusions"
```

---

## 4. Frontend Implementation

### Task 5: API Hooks & Master Settings Page
**Files:**
- Create: `apps/web/src/hooks/use-inclusions.ts`
- Create: `apps/web/src/hooks/use-exclusions.ts`
- Modify: `apps/web/src/hooks/use-packages.ts`
- Modify: `apps/web/src/app/dashboard/settings/master-data/page.tsx`

- [ ] **Step 5.1**: Implement `use-inclusions.ts` containing queries and mutations for CRUD operations.
- [ ] **Step 5.2**: Implement `use-exclusions.ts` containing queries and mutations for CRUD operations.
- [ ] **Step 5.3**: Update `use-packages.ts` to remove tag queries/mutations.
- [ ] **Step 5.4**: Open [page.tsx](file:///c:/Sobari/Ai/tawaf-sai/e-tawafsai/apps/web/src/app/dashboard/settings/master-data/page.tsx) and add two new `MasterList` sections for Inclusions and Exclusions.
- [ ] **Step 5.5**: Verify page loads and compiles, then commit.
```bash
git add apps/web/src/hooks apps/web/src/app/dashboard/settings/master-data/page.tsx
git commit -m "fe: add settings UI for inclusions and exclusions master catalogs"
```

### Task 6: Package Details Page Update
**Files:**
- Modify: `apps/web/src/app/dashboard/packages/[id]/page.tsx`

- [ ] **Step 6.1**: Open [page.tsx](file:///c:/Sobari/Ai/tawaf-sai/e-tawafsai/apps/web/src/app/dashboard/packages/%5Bid%5D/page.tsx). Replace the state variable `selectedTags` with `selectedInclusions` and `selectedExclusions` (arrays of string IDs).
- [ ] **Step 6.2**: Retrieve active inclusions and exclusions lists using the hooks `useInclusions()` and `useExclusions()`.
- [ ] **Step 6.3**: Update package payload construction to include `inclusions` and `exclusions` list of IDs.
- [ ] **Step 6.4**: Revamp the form layout to display two card grids of active items, supporting select/deselect pill button toggling.
- [ ] **Step 6.5**: Remove old tag mutation/save calls.
- [ ] **Step 6.6**: Run dev server to check the form visually, then commit.
```bash
git add apps/web/src/app/dashboard/packages/[id]/page.tsx
git commit -m "fe: revamp package details form to show separate inclusions and exclusions pill grids"
```

---

## 5. Verification & Tests

### Task 7: Integration Tests & Final Verification
**Files:**
- Create: `apps/api/src/inclusions/inclusions.service.int.spec.ts`
- Create: `apps/api/src/exclusions/exclusions.service.int.spec.ts`
- Modify: `apps/api/src/packages/packages.service.int.spec.ts`

- [ ] **Step 7.1**: Write inclusions service integration spec testing CRUD, uniqueness, and delete constraints.
- [ ] **Step 7.2**: Write exclusions service integration spec testing CRUD, uniqueness, and delete constraints.
- [ ] **Step 7.3**: Update packages service integration specs to test transaction inclusions/exclusions storage.
- [ ] **Step 7.4**: Run `bun run test:int` to ensure database integration tests pass.
- [ ] **Step 7.5**: Run `bun run verify` in the workspace root to confirm all tests, typechecks, and lints pass.
- [ ] **Step 7.6**: Commit verification files.
```bash
git add apps/api/src/inclusions/*.int.spec.ts apps/api/src/exclusions/*.int.spec.ts apps/api/src/packages/*.int.spec.ts
git commit -m "test: add integration specs for inclusions and exclusions"
```
