## Why

Package category is a fixed six-value enum (`regular | plus | private_vip | ramadan | arbain | other`) hardcoded in the schema and the create-package form, so tenants cannot model their own product lines. Commission also lives one level too high — a single default per Provider — even though real commission terms differ per product line (e.g. a Provider's VIP Umrah pays differently than its Regular Umrah). This change lets admins define their own categories, scoped to a Provider and product type, and attaches commission to the category where it belongs. It is change #3 of the Create Package form revamp; change #1 (`hide-inactive-providers-in-package-form`) is archived.

## What Changes

- **BREAKING**: Replace the fixed `category` pgEnum on `packages` with a `categoryId` foreign key to a new admin-defined `package_categories` table. The `PACKAGE_CATEGORIES` enum constant is retired as a persisted type (its six values survive only as seed names).
- Introduce **admin-defined categories** scoped by `(tenant, provider, productType)`, each carrying its own `commissionType` + `commissionValue`.
- **Move commission to the category level.** A category's commission is authoritative going forward. The Provider's `defaultCommissionType`/`defaultCommissionValue` remain as the **seed/fallback** used to prefill a new category's commission (Provider commission fields and their admin-only UI stay).
- **Migrate existing data**: for every `(provider, productType, legacy-category)` combination actually used by existing packages, create a category row seeded from the Provider's current commission, and repoint each package to its `categoryId`. Additionally seed the six legacy names per Provider so dropdowns have sensible defaults.
- **Package form**: the category dropdown is filtered by the selected Provider + product type; publish requires a valid `categoryId`.
- **Provider detail page**: new admin-only section to create/edit/delete categories (grouped by product type) with their commission. A category in use by packages cannot be hard-deleted.
- **Search**: adapt the category filter to work against admin-defined categories instead of the removed enum.

## Capabilities

### New Capabilities
- `provider-category-commission`: admin-defined package categories scoped by `(tenant, provider, productType)`, each owning a `commissionType`/`commissionValue`; category CRUD; commission seeding from the Provider default; deletion guard for in-use categories.

### Modified Capabilities
- `package-catalog`: a package's `category` becomes a required FK (`categoryId`) into the tenant's admin-defined categories rather than the fixed enum; publish validation requires `categoryId`; the category must belong to the package's Provider + product type.
- `provider-management`: Provider commission fields are redefined as the seed/default for new categories rather than the operative commission; category-level commission is admin-only under the same role-aware DTO rules.
- `package-search`: the category filter operates over admin-defined categories (by id/name) instead of the fixed enum.
- `user-management`: staff users never receive category-level commission fields, extending the existing commission-stripping guarantee to the new category commission.

## Impact

- **`packages/db`**: new `package_categories` table + `category_id` FK on `packages`; migration to backfill categories and repoint packages; drop the `category` pgEnum column. Seed script updates.
- **`packages/shared`**: retire `PACKAGE_CATEGORIES` as a persisted enum; new category request schemas + `CategoryDto` (admin) with commission; update package + publish + search schemas/DTOs to use `categoryId`.
- **`apps/api`**: category CRUD service/controller (admin-guarded, tenant-scoped) surfaced under providers; packages service maps `categoryId`; search service joins categories; typed mappers keep contract↔persistence aligned.
- **`apps/web`**: provider detail page category-management UI (admin-only); create-package form provider+type-filtered category dropdown; search filter update; TanStack Query hooks for categories.
- **Data/behavior**: one-time migration of existing packages; no pricing-engine change (commission remains reference metadata today).
