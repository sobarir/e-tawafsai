## 1. Shared contracts (packages/shared)

- [ ] 1.1 Retire `PACKAGE_CATEGORIES` as a persisted enum; keep the six values as an exported `LEGACY_CATEGORY_NAMES` seed constant only
- [x] 1.2 Add category request schemas (`createCategorySchema`, `updateCategorySchema`) with `name`, `commissionType`, `commissionValue` (reuse `COMMISSION_TYPES`)
- [x] 1.3 Add `CategoryDto` (admin, includes commission) and a staff-safe category shape (no commission); export `productType`/`providerId` scope fields
- [x] 1.4 Update `createPackageSchema`/`updatePackageSchema` to use `categoryId` (ULID) instead of `category`; update `publishPackageSchema` to require `categoryId`
- [ ] 1.5 Update `PackageDto` (`category: string` → `categoryId: string` + resolved `categoryName`); update `search.ts` category filter field to reference categories

## 2. Database schema (packages/db)

- [x] 2.1 Add `package_categories` table: ULID pk, tenant ownership, `providerId` FK, `productType` (product_type enum), `name`, `commissionType`, `commissionValue`, timestamps; unique index on `(tenant_id, provider_id, product_type, lower(btrim(name)))`
- [x] 2.2 Add nullable `category_id` FK on `packages` → `package_categories.id`; generate migration A additive (`db:generate`)
- [ ] 2.3 Write backfill runner `category-backfill-runner.ts` + pure `scripts/backfill-categories.ts` (script `db:backfill-categories`): per tenant, upsert categories from in-use `(provider, productType, category)` seeded from provider default commission; seed `LEGACY_CATEGORY_NAMES` under umrah + any in-use type; set `packages.category_id`; idempotent + count-check log
- [ ] 2.4 Generate migration B cutover: drop the `category` enum column + `category` pgEnum (no NOT NULL step — `category_id` stays nullable)
- [ ] 2.5 Update `seed.ts` to create demo categories directly and point demo packages at `categoryId`

## 3. API — categories module (apps/api)

- [x] 3.1 Create categories Nest module: service + controller, `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles("admin")`, tenant-scoped, surfaced under providers
- [x] 3.2 Implement list (by `providerId` + optional `productType`), create (seed commission from provider default when omitted), update, delete
- [x] 3.3 Enforce uniqueness pre-check (`409 Conflict`) and in-use delete guard (`409 Conflict`)
- [x] 3.4 Typed `toCategoryDto` mapper (admin) + staff-safe mapper stripping commission
- [x] 3.5 Category policy pure functions in `categories.policy.ts` (scope/ownership decisions)

## 4. API — packages & search wiring (apps/api)

- [x] 4.1 Packages service: map `categoryId`; validate assigned category belongs to package's provider + productType; update publish validation to require valid `categoryId`
- [ ] 4.2 Search service: join `package_categories`; adapt category filter to `categoryId`/name; keep tenant scoping

## 5. Web — category management + form (apps/web)

- [ ] 5.1 TanStack Query hooks `use-categories.ts` (key `["categories", providerId, productType]`) + mutations invalidating the resource root
- [ ] 5.2 Provider detail page: admin-only category-management section grouped by product type; create prefilled from provider default; edit/delete with in-use guard messaging via `readApiError()`
- [ ] 5.3 Package form: replace hardcoded `<select>` with data-driven dropdown filtered by selected provider + productType; refresh on provider/type change
- [ ] 5.4 Search filter: replace fixed category options with admin-defined categories

## 6. Tests & verification

- [ ] 6.1 Unit specs: `categories.policy.spec.ts` (scope/uniqueness/delete-guard) + packages publish/category-scope validation
- [ ] 6.2 Integration spec: `categories.service.int.spec.ts` (CRUD, seeding from provider default, delete guard, tenant isolation) — cleans up its own rows
- [ ] 6.3 Migration integration check: every existing package resolves to a non-null `category_id` after backfill
- [ ] 6.4 `bun run verify` passes (typecheck + lint + test); run `db:migrate` then `db:seed` to confirm end-to-end
