# Brainstorm Summary

- Change: airline-departure-city-master-data
- Date: 2026-07-07

## Confirmed Technical Approach

- Two tenant-global master tables `airlines` / `departure_cities` = `{ id, ...tenantOwned(), name varchar(120), isActive boolean default true, ...timestamps }`, each `uniqueIndex (tenantId, lower(btrim(name)))`. No provider/product-type scope.
- `packages` gets nullable `airlineId` / `departureCityId` FKs; free-text `airline` / `departure_city` columns dropped. Names read via join; FKs stay nullable (publish enforces presence).
- Migration mirrors #3's `0016`: `db:generate` additive DDL, then hand-added SQL — (a) per tenant upsert a master row per distinct non-blank existing value (case-insensitive, id via `upper(substr(md5(...),1,26))`, `ON CONFLICT DO NOTHING`); (b) `UPDATE packages` set FKs by normalized-name match; (c) drop old columns. No starter list injected into real tenants.
- `seed.ts` seeds a starter list for the **demo tenant only** and references by id on the demo package.
- API: two Nest modules mirroring `categories` (admin-guarded, tenant-scoped) — GET/POST/PATCH(name+isActive)/DELETE; normalized-name conflict → 409; delete of referenced row → 409. Decisions in `*.policy.ts` pure functions. Packages service validates FK tenant-ownership, enforces both at publish, resolves names via join. Search joins both tables, filters by joined name (exact, current behavior preserved), returns airline name.
- Web: `use-airlines` / `use-departure-cities` hooks; two admin sections under `/dashboard/settings`; form dropdowns (active + union assigned-deactivated on edit, submit ids); search filter + result card read names from DTO.

## Key Trade-offs and Risks

- Backfill creates one master row per distinct legacy spelling (intended, no data loss); case/whitespace variants collapse via normalized match; admins prune later.
- Migration correctness: FK nullable → no hard NOT NULL gate; still assert every previously-non-null value maps before dropping columns (dry-run on seeded DB).
- Blank/NULL free-text → NULL FK, no master row created.
- Search response shape unchanged (airline/city names still present) — only persistence source changes.

## Testing Strategy

- Unit (DB-free): both policies — normalization, tenant ownership, delete-guard decision.
- Integration: master CRUD + name-conflict + delete-guard; package assign → publish gating (missing airline/city blocks publish); search-by-airline-name. Migration verified via `db:migrate` + `db:seed`.

## Spec Patches

- Amend `airline-departure-city-master-data` delta spec, requirement "Starter seed and one-time backfill of existing values": starter list seeded for the **demo/dev tenant**, while the migration **backfills every tenant's** existing values. Supplement/clarify only — no scope change.
