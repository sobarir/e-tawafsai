## Context

Today `packages.category` is a Postgres enum (`category` pgEnum over the six `PACKAGE_CATEGORIES` values), hardcoded as `<option>`s in the create-package form and referenced by the search filter and publish validation. Commission lives on `providers` as a single `defaultCommissionType`/`defaultCommissionValue`/`commissionNotes` triple, is admin-only (stripped from `StaffProviderDto`), and is **pure reference metadata** — no pricing code consumes it (verified: `defaultCommission*` is read only by the providers CRUD/display path).

Tenants need per-tenant product lines and commission that varies by product line, not one flat default per Provider. Multi-tenancy, provider-management, package-catalog, and package-search capabilities already exist and are the integration seams. This is change #3 of the Create Package form revamp (order 1→3→2→4→5); it merges to `main` locally before the next change.

## Goals / Non-Goals

**Goals:**
- Admin-defined categories scoped by `(tenant, provider, productType)`, each owning `commissionType` + `commissionValue`.
- `packages.category` enum → `categoryId` FK (single source of truth; name read by join, no denormalized copy).
- Provider `defaultCommission*` becomes the seed used to prefill a new category's commission; category commission is authoritative thereafter.
- Non-destructive migration of existing packages; every package ends on a valid `categoryId`.
- Form category dropdown filtered by selected Provider + product type; search filter adapted; publish requires `categoryId`.
- Category commission is admin-only (same guarantee as Provider commission).

**Non-Goals:**
- No pricing-engine work — commission stays reference metadata.
- No per-category commission *notes* (notes remain at Provider level).
- Airline/city master data (#2), hotel catalog (#4), inclusions/exclusions (#5) — separate changes.
- No public-surface changes beyond the existing search filter.

## Decisions

**D1 — New `package_categories` table, category scoped by `(tenant, provider, productType)`.**
Columns: `id` (ULID), tenant ownership, `providerId` FK, `productType` (product_type enum), `name` (varchar), `commissionType` (commission_type enum), `commissionValue` (integer). Unique on `(tenant_id, provider_id, product_type, lower(btrim(name)))` so the same name may exist under different Provider/type but not collide within one. Rationale: mirrors the Provider uniqueness idiom already in the repo; scoping key matches the form filter exactly.
- *Alternative considered*: global-per-tenant categories with a separate applicability table → rejected as over-engineered; scope is inherently per Provider+type.

**D2 — `packages.categoryId` FK, drop the enum column.**
Replace `category` enum column with `category_id` ULID FK → `package_categories.id` (`NOT NULL` after backfill). Name is read via join in package/search read paths. Rationale: DRY — one source of truth, rename-safe.
- *Alternative considered*: keep a denormalized name string → rejected (drift risk on rename; user chose FK-only).

**D3 — Provider commission stays as seed/fallback.**
Keep `providers.defaultCommission*` and their admin UI. When an admin creates a new category, prefill commission from the Provider default. Migration seeds each created category's commission from the Provider's current default. Rationale: preserves existing partner-default semantics while making category the operative level.

**D4 — Migration: backfill in-use combos + seed legacy names.**
Migration (SQL + data step) runs: (a) for each distinct `(provider_id, product_type, category)` present in `packages`, upsert a `package_categories` row (name = legacy value, commission = Provider default); (b) additionally seed the six legacy names per Provider under each product type in use, so dropdowns are populated; (c) set `packages.category_id` by matching, then enforce `NOT NULL` and drop the old enum column. Seed script (`packages/db/src/seed.ts`) updated to create demo categories directly. Rationale: no package is orphaned; dropdowns are usable immediately.

**D5 — Category CRUD API surfaced under providers, admin-guarded.**
New Nest module (categories) with `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles("admin")`, tenant-scoped. Endpoints: list by `providerId` (+ optional `productType`), create, update, delete. Delete is blocked (`ConflictException`) when any package references the category. `CategoryDto` carries commission and is admin-only; staff never receive it (extends the existing role-aware DTO convention). Rationale: reuses established RBAC + DTO seams.

**D6 — Web: category management on the Provider detail page.**
Admin-only section on `/dashboard/providers/[id]`, categories grouped by product type, each row editable with commission; create prefilled from Provider default. Create-package form (`/dashboard/packages/[id]`) replaces the hardcoded `<select>` with a data-driven dropdown filtered by the chosen `providerId` + `productType` (TanStack Query hook, key `["categories", providerId, productType]`). Search filter reads categories similarly.

## Risks / Trade-offs

- **Migration correctness on live data** → dry-run against a seeded DB; verify every package has a non-null `category_id` before the `NOT NULL` + enum-drop step; the `NOT NULL`/drop is a separate final migration guarded by a count check.
- **Enum removal ripples** (shared type, search schema, publish schema, spec files) → `bun run verify` gate; typed mappers surface any dangling `category` string usage at compile time.
- **Search filter semantics change** (free-form names across Providers) → filter by category id where a Provider is selected; by name match otherwise. Confirm exact behavior in `/comet-design` delta spec.
- **Category name collision on rename** → enforced by the unique index; API returns `ConflictException` with a field error.
- **Cross-scope assignment** (assigning a category that doesn't belong to the package's Provider+type) → validated in the packages service against the category's scope.

## Migration Plan

1. Add `package_categories` table + `category_id` nullable FK on `packages` (migration 1).
2. Data migration: backfill categories from in-use combos + seed legacy names; set `category_id`.
3. Enforce `category_id NOT NULL` and drop the `category` enum column (migration 2, after count check).
4. Rollback: migrations are additive-then-cutover; before step 3, dropping `category_id` and the table restores the enum path. After step 3, roll back by re-adding the enum column from `package_categories.name`.

## Open Questions

- Exact search-filter behavior when no Provider is selected (id vs name match) — resolve in `/comet-design` delta spec.
- Whether legacy-name seeding should cover all three product types or only those a Provider actually uses — leaning "in use only" to avoid noise; confirm in design.
