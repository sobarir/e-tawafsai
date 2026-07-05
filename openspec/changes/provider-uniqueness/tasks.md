## 1. Shared normalization

- [x] 1.1 Add a provider-key normalization helper in `packages/shared` (`normalizeProviderName` → `lower(trim)`, `normalizePpiu` → `trim`, empty → `null`) with unit spec covering case/whitespace/blank cases
- [x] 1.2 Export the helper from the shared package index

## 2. API enforcement (create/update pre-check)

- [x] 2.1 In `ProvidersService.create`, normalize PPIU (blank→null) and pre-check the tenant for a name or PPIU collision; throw `ConflictException` identifying the existing provider
- [x] 2.2 In `ProvidersService.update`, apply the same normalization + collision pre-check, excluding the row being updated
- [x] 2.3 Map a DB unique-violation to the same `409 Conflict` as a concurrency backstop
- [x] 2.4 Unit specs: create/update rejected on name dup, PPIU dup, update-into-collision; blank PPIU allowed; cross-tenant allowed (policy/service-level)

## 3. Dedup migration (one-time cleanup)

- [x] 3.1 Implement per-tenant duplicate clustering (transitive closure over normalized-name OR non-empty normalized-PPIU edges)
- [ ] 3.2 Implement survivor selection (active first, then lowest ULID) and package repoint (`packages.providerId` losers→survivor), then delete losers — all in one transaction
- [ ] 3.3 Normalize existing blank PPIUs to NULL as the first migration step
- [ ] 3.4 Integration spec: seed a tenant with a name-dup and a PPIU-dup forming one cluster; assert one survivor, packages repointed with no orphans, active-preference honored

## 4. DB unique constraints

- [ ] 4.1 Add expression unique index `UNIQUE (tenant_id, lower(trim(name)))` on `providers`
- [ ] 4.2 Add partial expression unique index `UNIQUE (tenant_id, trim(ppiu_license_no)) WHERE ppiu_license_no IS NOT NULL`
- [ ] 4.3 Generate the migration and sequence it AFTER the dedup cleanup (same transaction / same migration run)
- [ ] 4.4 Integration spec: constraint rejects a direct duplicate insert; allows blank-PPIU and cross-tenant rows

## 5. Verify

- [ ] 5.1 Run `bun run db:migrate` then `bun run db:seed` on a duplicate-laden fixture and confirm clean apply
- [ ] 5.2 `bun run verify` (typecheck + lint + test) and `bun run test:int` for providers pass
