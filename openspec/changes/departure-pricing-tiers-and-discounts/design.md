## Context

Departure pricing lives on the `departures` table and flows through three layers that must stay in lock-step per the repo's DRY boundaries: columns in `packages/db`, wire shapes in `packages/shared`, and a typed mapper (`toDepartureDto`) plus create/update payloads in `apps/api/src/departures/departures.service.ts`. The web form (`DeparturesSection` in the package detail page) is the only entry point today, and it renders only when editing a saved package.

The schema already carries `priceTriple`/`priceDouble` (both nullable); the UI simply never exposed them. This change adds a parallel set of discounted-price columns and finally surfaces the whole matrix — both in the existing editor and in a new optional inline block on the create flow.

## Goals / Non-Goals

**Goals:**
- Persist optional `priceQuadDiscount` / `priceTripleDiscount` / `priceDoubleDiscount` on departures.
- Validate each discounted price as positive and `≤` its normal counterpart.
- Expose triple/double + all three discounted inputs in the departure form.
- Let admins enter a full first departure (date + matrix) inline while creating a package, without making it mandatory.

**Non-Goals:**
- Moving any pricing onto the package row.
- Feeding discounted prices into public search / `priceFrom` (still keyed off `priceQuad`).
- Any change to seat inventory, status lifecycle, payment schedule, or adjustment audit logic.

## Decisions

**1. Discount as three sibling nullable columns, not a JSON blob or a separate table.**
Mirrors the existing `priceTriple`/`priceDouble` shape exactly, so the mapper and create/update payloads extend by three symmetric lines each. Alternative (a `discounts` JSON column) was rejected: it would break the integer-minor-unit convention and complicate querying later. A separate promo table is overkill for a single optional price per occupancy.

**2. Cross-field validation (`discount ≤ normal`) lives in the shared Zod schema via `superRefine`.**
Keeps one source of truth for the rule; both the create form, the inline create block, and the standalone edit form submit the full matrix in one payload, so the refine can always compare the pair. Rationale over service-level checks: the field-level error surfaces in the standard envelope's `errors` and renders inline in the form. Limitation: a *partial* update that sends only a discount field (not its normal price) cannot be compared against the stored normal at schema level — accepted, because both UI entry points always send the matched pair; a service-level guard can be added later if a partial-only path appears.

**3. Inline create departure = reuse the existing create-departure endpoint, posted after the package is created.**
The create form already sequences follow-up posts after `createPackage` (flyers, tags). The inline departure follows the same pattern: if the admin filled the date + a quad price, POST one departure to `departures` using `created.id`; otherwise skip. No new endpoint, no transactional coupling — a failed departure post surfaces via `readApiError` while the package still exists as a draft, consistent with the existing flyer/tag flow.

**4. "Filled" detection for the optional inline block = presence of a departure date.**
Simplest unambiguous signal. If a date is present the block is validated as a full departure (quad price + DP required by the schema); if absent, the whole block is ignored.

## Risks / Trade-offs

- **Partial-update discount without normal price bypasses the `≤` check** → Mitigation: both form entry points submit the full matrix; documented as a known gap, cheap to close with a service guard if a partial path is added.
- **Inline departure post fails after package is created** → Mitigation: same non-atomic pattern already used for flyers/tags; the package persists as draft and the admin can add the departure from the editor. Error is shown near the action.
- **Migration adds three columns to a populated table** → Mitigation: all nullable with no default; additive and safe, no backfill, trivially reversible.

## Migration Plan

1. Add columns in `packages/db` schema; `bun run db:generate` to emit the SQL migration; `bun run db:migrate`.
2. Extend shared schema + DTO, then the API mapper and create/update payloads.
3. Wire the web form fields (edit section first, then inline create block).
4. `bun run verify`; integration spec covers persistence + the `discount ≤ normal` rejection.

Rollback: revert the code and drop the three additive nullable columns; no data reshaping required.

## Open Questions

- None blocking. Whether public search should eventually prefer the discounted price for display is deferred to a future change (explicit non-goal here).
