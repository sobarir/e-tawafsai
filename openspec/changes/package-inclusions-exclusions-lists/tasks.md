## 1. Database Schema & Migration

- [x] 1.1 Modify `packages/db/src/schema/packages.ts` to define `inclusions`, `exclusions`, `packageInclusions`, and `packageExclusions` tables, and remove `tags` and `packageTags` tables.
- [x] 1.2 Generate database migrations using `bun run db:generate`.
- [x] 1.3 Apply database migrations using `bun run db:migrate`.

## 2. Shared Types & Schemas

- [x] 2.1 Update `packages/shared/src/packages.ts` to include `createInclusionSchema`, `updateInclusionSchema`, `createExclusionSchema`, `updateExclusionSchema`, and updated package validation schemas/DTOs. Remove tag schemas.
- [x] 2.2 Rebuild packages or verify types check across the workspace.

## 3. Backend API Implementation

- [x] 3.1 Implement inclusions controller, service, module, and policy under `apps/api/src/inclusions`.
- [x] 3.2 Implement exclusions controller, service, module, and policy under `apps/api/src/exclusions`.
- [x] 3.3 Register new modules in `apps/api/src/app.module.ts`.
- [x] 3.4 Update `PackagesService` to save inclusions and exclusions atomically using `this.db.transaction` in create/update methods.
- [x] 3.5 Update `PackagesController` to remove tag endpoints.

## 4. Frontend Implementation

- [ ] 4.1 Create hooks `use-inclusions.ts` and `use-exclusions.ts` in `apps/web/src/hooks` and update package hooks.
- [ ] 4.2 Revamp `/dashboard/settings/master-data` UI to manage inclusions and exclusions catalogs.
- [ ] 4.3 Revamp `/dashboard/packages/[id]` form to select inclusions and exclusions via separate checkbox grids.

## 5. Verification & Tests

- [ ] 5.1 Implement integration tests for inclusions/exclusions API.
- [ ] 5.2 Implement package integration tests verifying inclusions/exclusions.
- [ ] 5.3 Run `bun run verify` and ensure all quality checks pass.
