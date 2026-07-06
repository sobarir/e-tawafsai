---
comet_change: departure-pricing-tiers-and-discounts
role: technical-design
canonical_spec: openspec
---

# Departure Pricing Tiers & Discounts — Technical Design

## Summary

Surface the full departure price matrix (quad/triple/double, each with an optional
discounted price) where admins actually work, and let a first departure be entered
inline while creating a package. Pricing stays on the `departures` row; this change
adds three additive nullable discount columns and finally exposes the columns that
already exist but were never wired into the UI.

## Layered change map (DRY boundaries)

Pricing flows through three layers that must stay in lock-step. Each is extended by
three symmetric additions:

| Layer | File | Change |
|-------|------|--------|
| Columns | `packages/db/src/schema/departures.ts` | Add `priceQuadDiscount`, `priceTripleDiscount`, `priceDoubleDiscount` — nullable integer (minor units) |
| Wire shape | `packages/shared/src/departures.ts` | Extend `createDepartureSchema` (`z.number().int().positive().nullable().optional()`) + `DepartureDto`; add cross-field `superRefine` |
| Mapper + payloads | `apps/api/src/departures/departures.service.ts` | Extend `toDepartureDto` and the create + partial-update payloads, mirroring the `priceTriple`/`priceDouble` `?? null` pattern |

No change to seat inventory, status lifecycle, payment schedule, or adjustment audit.

## Key decisions

**1. Three sibling nullable columns, not JSON or a promo table.**
Mirrors the existing `priceTriple`/`priceDouble` shape exactly, keeping the
integer-minor-unit convention and letting the mapper and payloads extend by three
symmetric lines. A JSON `discounts` blob would break the minor-unit convention and
complicate later querying; a separate promo table is overkill for a single optional
price per occupancy.

**2. `discount ≤ normal` validation lives in the shared Zod schema (`superRefine`).**
One source of truth for the rule. All entry points — the standalone edit form, the
inline create block, the create-departure endpoint — submit the full matrix in one
payload, so the refine can always compare each discount against its normal
counterpart and emit a field-level error on the discount path (surfaced through the
standard envelope's `errors` and rendered inline).

*Known limitation:* a partial update sending only a discount field (not its normal
price) cannot be compared at schema level against the stored normal. Accepted — both
UI entry points always send the matched pair, and the edit-time UI only ever creates
departures (no price-edit path; only "Adjust Seats"). A service-level guard can be
added later if a partial-only path appears.

**3. Inline create = reuse the existing create-departure endpoint, posted after the
package is created.**
The create form already sequences follow-up posts (flyers, tags) after
`createPackage`. The inline departure follows the same pattern: if a departure date
was entered, POST one departure to `departures` using `created.id`; otherwise skip.
No new endpoint and no transactional coupling — a failed departure post surfaces via
`readApiError` while the package still exists as a draft, consistent with the
existing flyer/tag flow.

**4. "Filled" detection for the optional inline block = presence of a departure date.**
Simplest unambiguous signal. Date present → the block is validated as a full
departure (quad price + DP required by the schema); date absent → the whole block is
ignored and the package is created with zero departures.

**5. Extract `DepartureFormFields` for reuse.**
Pull the departure entry fields, their local state, and the payload assembly
(including the existing `paymentSchedule` derivation from normal `priceQuad`) into one
reusable component. Consumed by both the edit-time `DeparturesSection` and the new
"First departure (optional)" card on the create form (admin-only, `isNew`). Keeps the
matrix layout and validation identical across both entry points.

## Price-matrix layout

Three occupancy rows (Quad / Triple / Double) × two columns (Normal / Discounted).
Quad-normal is required; all other cells optional. Discounted prices never gate
`open` status or availability — the existing rule "a departure SHALL NOT be `open`
without `priceQuad`" is unchanged. Payment schedule / DP remain derived from the
normal `priceQuad` (`[DP, Pelunasan = priceQuad − dpAmount]`).

## Risks / trade-offs

- **Partial-update discount without its normal price bypasses the `≤` check** →
  theoretical only; both form entry points submit the full matrix. Documented gap,
  cheap to close with a service guard.
- **Inline departure post fails after package creation** → non-atomic, same pattern
  already used for flyers/tags; package persists as a draft and the admin can add the
  departure from the editor. Error shown near the action.
- **Migration adds three columns to a populated table** → all nullable, no default;
  additive and reversible, no backfill.

## Testing strategy

- **Shared unit spec** (`departures.spec.ts`): refine accepts a valid matrix, rejects
  a discount above its normal counterpart, allows discounts omitted.
- **API integration spec** (`departures.service.int.spec.ts`): discount fields
  persist and round-trip; an above-normal discount is rejected.
- **Gate:** `bun run verify` (typecheck + lint + test) and `bun run test:int`.

## Migration plan

1. Add columns in `packages/db`; `bun run db:generate` to emit SQL; `bun run db:migrate`.
2. Extend shared schema + DTO, then the API mapper and create/update payloads.
3. Wire the web form fields (edit section first, then inline create block).
4. `bun run verify` + integration spec.

Rollback: revert the code and drop the three additive nullable columns; no data
reshaping required.

## Spec patches

None. The OpenSpec delta spec (`specs/departure-inventory/spec.md`) already covers the
`discount ≤ normal` rule and all three inline-create acceptance scenarios; no gaps
found.
