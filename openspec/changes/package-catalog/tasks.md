# Tasks: package-catalog

## 1. Contracts & schema

- [x] 1.1 Shared: `PRODUCT_TYPES`, `PACKAGE_CATEGORIES`, `PACKAGE_STATUSES` tuples; package request/response schemas; seeded inclusion tag list
- [x] 1.2 DB: `packages`, `package_flyers`, `tags`, `package_tags` tables (tenant-owned; per-tenant unique slug index); migration + tag seeding

## 2. API

- [x] 2.1 Packages module per feature pattern; tenant-scoped CRUD; productType hard-locked to `umrah`
- [x] 2.2 Slug service (generate, collision suffix, immutable-after-publish)
- [x] 2.3 Publish/unpublish endpoints with `packages.policy.ts` completeness + provider-license validation
- [x] 2.4 Flyer upload endpoints via storage seam (multi-image); provider-deactivation cascade consumer (unpublish transaction)

## 3. Web UI

- [x] 3.1 Catalog list with status filter; package admin page with flyer gallery
- [x] 3.2 Flyer-first create/edit flow: upload step, side-by-side flyer + form (sticky on 380px), tag multi-selects with free-text add, camera capture on mobile
- [x] 3.3 Publish action surfacing field-level errors inline

## 4. Verification

- [x] 4.1 Unit tests: publish policy matrix, slug generation/collision/immutability
- [x] 4.2 Integration tests: CRUD tenant-scoped; cascade unpublish with provider-management; flyer persistence
- [x] 4.3 `bun run verify` and `bun run test:int` pass

