---
comet_change: provider-category-commission
role: technical-design
canonical_spec: openspec
archived-with: 2026-07-06-provider-category-commission
status: final
---

# provider-category-commission — Technical Design

Deep design for change #3 of the Create Package form revamp. Canonical requirements live in the OpenSpec delta specs under `openspec/changes/provider-category-commission/specs/`; this doc records HOW, not WHAT.

## Context

`packages.category` is a `NOT NULL DEFAULT 'regular'` Postgres enum (`category` pgEnum over the six `PACKAGE_CATEGORIES` values), hardcoded as `<option>`s in the create-package form and referenced by the search filter and publish validation. Commission lives on `providers` as a single `defaultCommissionType`/`defaultCommissionValue`/`commissionNotes` triple, admin-only (stripped from `StaffProviderDto`), and is **pure reference metadata** — no pricing code consumes it. Tenants need per-tenant product lines and commission that varies per product line.

Established seams this design reuses:
- **Uniqueness idiom**: `providers` uses `uniqueIndex(... lower(btrim(name)) ...)` for per-tenant normalized-name uniqueness.
- **Data-migration idiom**: `dedup-providers` runs as an additive migration → a TS runner (`bun src/dedup-providers-runner.ts`, logic in `scripts/dedup-providers.ts`, script `db:dedup-providers`) → a constraint migration.
- **Admin-only DTO idiom**: role-aware DTOs strip commission for staff (`StaffProviderDto`).
- **RBAC idiom**: `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles("admin")`; ownership decisions in `*.policy.ts`.

## Goals / Non-Goals

**Goals**
- Admin-defined categories scoped by `(tenant, provider, productType)`, each owning `commissionType` + `commissionValue`.
- `packages.category` enum → nullable `categoryId` FK (single source of truth; name via join).
- Provider `defaultCommission*` becomes the seed to prefill a new category's commission; category commission is authoritative thereafter.
- Non-destructive, idempotent migration; every existing package ends on a valid `categoryId`.
- Form category dropdown filtered by selected provider + productType; search filter by category name; publish requires `categoryId`.
- Category commission admin-only.

**Non-Goals**
- No pricing-engine work — commission stays reference metadata.
- No per-category commission notes (notes stay at provider level).
- Airline/city (#2), hotel catalog (#4), inclusions/exclusions (#5) — separate changes.
- No public-surface changes beyond the existing search filter.

## Decisions

### D1 — `package_categories` table, scoped by `(tenant, provider, productType)`
Columns: `id` (ULID), `...tenantOwned()`, `providerId` (`ulidRef`, FK → providers), `productType` (`productTypeEnum`), `name` (`varchar(120)`), `commissionType` (`commissionTypeEnum`), `commissionValue` (`integer`), `...timestamps`. Unique index on `(tenant_id, provider_id, product_type, lower(btrim(name)))`. Rationale: the scoping key is exactly the form's filter key, and the normalized-name uniqueness mirrors providers. Enums are reused (`product_type`, `commission_type`) — no new enum types.

### D2 — `packages.category_id` nullable FK; drop the enum
Replace `category` enum column with `category_id` (`ulidRef`, nullable, FK → `package_categories.id`). Draft packages MAY have no category (`drafts MAY be incomplete`); publish validation requires it. Name is read via LEFT JOIN in package/search read paths. Rationale: nullable avoids forcing a category before provider+type is chosen and decouples package creation from category existence; DRY single source of truth, rename-safe. *Alternative (NOT NULL + auto-select first)* rejected — couples create to categories existing and needs a block-on-empty fallback.

### D3 — Provider commission stays as seed/fallback
Keep `providers.defaultCommission*` and their admin UI. Creating a category without explicit commission seeds it from the provider default. Migration seeds each created category from the provider's current default. Rationale: preserves partner-default semantics while making category operative.

### D4 — Migration: additive → idempotent backfill runner → cutover
Three steps, mirroring `dedup-providers`:
1. **Migration A (additive)**: create `package_categories`; add nullable `packages.category_id`.
2. **Backfill runner** — `packages/db/src/category-backfill-runner.ts` (thin CLI) + `packages/db/src/scripts/backfill-categories.ts` (pure logic), script `db:backfill-categories`. Per tenant, in one transaction:
   - For each distinct `(provider_id, product_type, category)` present in `packages`, upsert a `package_categories` row with `name = <legacy value>`, commission seeded from that provider's `defaultCommissionType`/`defaultCommissionValue`.
   - Additionally seed the six `LEGACY_CATEGORY_NAMES` under `umrah` for every provider, plus under any product type a provider already has packages in.
   - Set `packages.category_id` by matching `(provider_id, product_type, name = legacy category)`.
   - Log a count check (packages with null `category_id` after backfill — expected 0).
   - Idempotent: upserts on the unique key; re-running is a no-op.
3. **Migration B (cutover)**: drop the `category` column and the `category` pgEnum. No `NOT NULL` step (column stays nullable).

Rollback: additive-then-cutover. Before Migration B, dropping `category_id` + the table restores the enum path. After B, roll back by re-deriving the enum column from `package_categories.name`.

### D5 — Categories API under providers, admin-guarded
New Nest categories module: service + controller, `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles("admin")`, tenant-scoped. Endpoints: list by `providerId` (+ optional `productType`), create (seed commission from provider default when omitted), update, delete. Delete returns `409 Conflict` when any package references the category (guard). Name uniqueness pre-check returns `409 Conflict` (belt-and-suspenders with the unique index). `toCategoryDto` (admin, includes commission) + a staff-safe mapper that strips commission. Pure decisions in `categories.policy.ts` (scope match, uniqueness, delete-guard). Packages service validates an assigned category belongs to the package's provider + productType, and publish requires a valid `categoryId`.

### D6 — Web: category management on the provider page; data-driven form dropdown
`use-categories.ts` TanStack Query hook, key `["categories", providerId, productType]`; mutations invalidate the resource root. Provider detail page (`/dashboard/providers/[id]`): admin-only section, categories grouped by product type, each row editable with commission; create prefilled from the provider default; delete/edit surface the in-use `409` via `readApiError()` with `role="alert"`. Package form (`/dashboard/packages/[id]`): replace the hardcoded `<select>` with a data-driven dropdown filtered by the chosen `providerId` + `productType`, refreshed on change. Search filter: replace fixed options with distinct admin-defined category names; filter matches packages by category name via the join.

## Risks / Trade-offs

- **Migration correctness on live data** → Idempotent runner; count-check log; integration test asserts every existing package gets a non-null `category_id` and a re-run is a no-op. Cutover (Migration B) runs only after backfill.
- **Enum-removal ripple** (shared type, search schema, publish schema, spec files, form) → `bun run verify` gate; typed mappers surface dangling `category` string usage at compile time.
- **Nullable `category_id`** → all read/search/display paths LEFT JOIN and are null-safe (a draft may show "no category").
- **Cross-scope assignment** (category from wrong provider/type) → validated in the packages service against the category's scope.
- **Name collision on create/rename** → `409 Conflict` via pre-check + unique index; surfaced as a field error.

## Migration Plan

1. Deploy Migration A (additive) + the categories API + shared/web using nullable `category_id`.
2. Run `bun run db:backfill-categories` (after `db:migrate`); verify the count check reports 0 null `category_id`.
3. Deploy Migration B (drop `category` column + pgEnum).
- Local batch flow: `db:migrate` → `db:backfill-categories` → `db:seed`, then `bun run verify`.

## Testing Strategy

- **Unit**: `categories.policy.spec.ts` (scope match, name-uniqueness decision, delete-guard); packages publish + category-scope validation.
- **Integration**: `categories.service.int.spec.ts` (CRUD, seed-from-provider-default, delete-guard `409`, tenant isolation, uniqueness `409`) — self-cleaning rows; backfill integration (every existing package → non-null `category_id`; idempotent re-run).
- **Gate**: `bun run verify`; then `db:migrate` → `db:backfill-categories` → `db:seed` end-to-end.

## Spec Patches (written back to OpenSpec delta specs)

1. `package-catalog` — Package entity requirement: `categoryId` is **nullable, required at publish** (not "required" outright); add a scenario that a draft MAY have no category.
2. `package-search` — category filter matches **by category name** (remove the "or by id" ambiguity).

## Implementation Divergence (recorded at verify, 2026-07-07)

**D4 migration mechanism changed: standalone TS backfill runner → atomic in-migration SQL backfill.**

D4 / the Migration Plan originally specified three ordered steps: additive migration (0015) → an idempotent **TS backfill runner** (`db:backfill-categories`) run in an operator window → cutover migration (0016) that drops the column. That runner was built (build Task 9).

During the cutover (build Task 10), a data-safety review found this unsafe under this repo's tooling: `drizzle-kit migrate` applies pending migrations **back-to-back with no operator window**, so committing 0016 alongside 0015 and relying on a between-migrations runner would drop `packages.category` before any backfill ran — **silently losing existing packages' category data**. Fresh/seeded DBs were unaffected (seed sets `categoryId` directly), which masked the risk in tests.

**Resolution (user-approved):** the backfill was folded into the cutover migration `0016_late_venus.sql` itself, which now runs atomically, in order:
1. `INSERT INTO package_categories` one row per distinct in-use `(tenant, provider, product_type, category)` (deterministic id, legacy display-name via `CASE`, commission from the provider default), `ON CONFLICT DO NOTHING`.
2. `UPDATE packages SET category_id = <matched by normalized name>` where `category_id IS NULL`.
3. `ALTER TABLE packages DROP COLUMN category; DROP TYPE category`.

The standalone TS runner (`category-backfill-runner.ts`, `scripts/backfill-categories.ts`, its int spec, the `db:backfill-categories` script) was **removed as superseded**. Existing-row safety is proven by `packages/db/src/scripts/migrate-cutover.int.spec.ts` (reconstructs pre-0016 rows, runs the shipped SQL verbatim, asserts repoint + provider-seeded commission + idempotency).

**Behavioral impact:** none — the specs' guarantee ("every existing package ends on a valid `categoryId`, commission seeded from the provider default") holds. Only the delivery mechanism changed, for atomicity/data-safety.

**Deployment caveat:** `0016` was edited in place on this unreleased branch. It heals fresh and dev databases; an environment that had already applied the *old* bare-drop `0016` would not be healed by the edit (that migration is recorded as applied). No such environment exists on this branch.
