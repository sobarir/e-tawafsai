# Brainstorm Summary

- Change: provider-category-commission
- Date: 2026-07-06

## Confirmed Technical Approach

**Data model**
- New `package_categories` table: ULID pk, `tenantOwned()`, `providerId` FK, `productType` (product_type enum), `name` (varchar), `commissionType` (commission_type enum), `commissionValue` (integer), timestamps. Unique index on `(tenant_id, provider_id, product_type, lower(btrim(name)))` — mirrors the provider-uniqueness idiom.
- `packages.category_id`: **nullable** ULID FK → `package_categories.id`. Drafts MAY have no category; publish requires it. Drop the old `category` enum column + `category` pgEnum after backfill.

**Migration (mirrors the dedup-providers precedent: additive migration → TS runner → cutover migration)**
1. Migration A (additive): create `package_categories`; add nullable `category_id` to `packages`.
2. TS runner `bun src/category-backfill-runner.ts` (pure logic in `scripts/backfill-categories.ts`), exposed as `db:backfill-categories`: per tenant — upsert a category for each distinct `(provider_id, product_type, category)` present in `packages`, seeded from that provider's `defaultCommissionType`/`defaultCommissionValue`; additionally seed the 6 legacy names under **umrah + any product type actually in use** per provider; set `packages.category_id` by matching `(provider, productType, legacy-name)`. Idempotent; per-tenant transaction; non-destructive.
3. Migration B (cutover): drop `category` column + `category` pgEnum. (No NOT NULL step — category_id stays nullable.)

**Shared (`packages/shared`)**
- Retire `PACKAGE_CATEGORIES` as a persisted enum → keep the six values as `LEGACY_CATEGORY_NAMES` seed constant.
- `createCategorySchema`/`updateCategorySchema` (`name`, `commissionType`, `commissionValue`, reuse `COMMISSION_TYPES`); `CategoryDto` (admin, includes commission) + staff-safe category shape (no commission).
- Package schemas use `categoryId` (nullable on create/update; required in `publishPackageSchema`). `PackageDto`: `categoryId` + resolved `categoryName`. Search filter: category matched by **name** (distinct tenant category names).

**API (`apps/api`)**
- Categories Nest module surfaced under providers: `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles("admin")`, tenant-scoped. Endpoints: list by `providerId` (+ optional `productType`), create (seed commission from provider default when omitted), update, delete (`409 Conflict` if any package references it). Name uniqueness pre-check → `409`. `toCategoryDto` (admin) + staff strip. `categories.policy.ts` pure functions (scope/uniqueness/delete-guard).
- Packages service: map `categoryId`; validate assigned category belongs to the package's provider + productType; publish requires a valid `categoryId`.
- Search service: left-join `package_categories`; filter by category **name**; null-safe for packages with no category.

**Web (`apps/web`)**
- `use-categories.ts` hook, key `["categories", providerId, productType]`; mutations invalidate the resource root.
- Provider detail page: admin-only category-management section grouped by product type; create prefilled from the provider default; edit/delete with in-use messaging via `readApiError()`.
- Package form: data-driven category dropdown filtered by selected provider + productType; refresh on change.
- Search filter: replace fixed options with distinct admin-defined category names.

## Key Trade-offs and Risks

- **Migration correctness on live data** → idempotent runner; runner logs a count check; integration test asserts every existing package gets a non-null `category_id` and a re-run is a no-op. Cutover migration runs only after backfill.
- **Enum removal ripples** (shared type, search schema, publish schema, spec files, form) → `bun run verify` + typed mappers surface dangling `category` string usage at compile time.
- **Nullable category_id** → all read/search/display paths use LEFT JOIN and are null-safe (a draft may have no category).
- **Cross-scope assignment** (category from wrong provider/type) → validated in the packages service.
- **Name collision** → `409` via pre-check + unique index.

## Testing Strategy

- Unit: `categories.policy.spec.ts` (scope, name-uniqueness decision, delete-guard); packages publish + category-scope validation.
- Integration: `categories.service.int.spec.ts` (CRUD, seed-from-provider-default, delete-guard 409, tenant isolation, uniqueness 409) — self-cleaning rows; backfill integration (every existing package → non-null category_id; idempotent re-run).
- Gate: `bun run verify`; then `db:migrate` → `db:backfill-categories` → `db:seed` end-to-end.

## Spec Patches

Supplementary/clarifying only (no structural rewrite):
1. `package-catalog` delta — Package entity: `categoryId` is **nullable, required at publish** (not "required" outright); add scenario: a draft MAY have no category.
2. `package-search` delta — category filter matches by **category name** (drop the "or by id" ambiguity).
3. `provider-category-commission` delta — no change needed; form-filter + commission-seed + delete-guard already specified.
