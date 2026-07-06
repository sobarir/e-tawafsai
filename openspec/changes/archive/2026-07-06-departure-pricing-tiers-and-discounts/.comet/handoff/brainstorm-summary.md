# Brainstorm Summary

- Change: departure-pricing-tiers-and-discounts
- Date: 2026-07-06

## Confirmed Technical Approach

Per-departure pricing model retained. Add three additive **nullable** integer columns to
`departures`: `priceQuadDiscount`, `priceTripleDiscount`, `priceDoubleDiscount` (minor units).

- **Shared contract**: extend `createDepartureSchema` with the three fields
  (`z.number().int().positive().nullable().optional()`), extend `DepartureDto`, and add a
  `superRefine` enforcing each discount `≤` its normal counterpart with a field-level error.
- **API**: extend `toDepartureDto` and the create + partial-update payloads in
  `departures.service.ts`, mirroring the existing `priceTriple`/`priceDouble` `?? null` pattern.
  No inventory / status-lifecycle / payment-schedule / adjustment changes.
- **Web (shared component)**: extract the departure entry fields + local state + payload
  assembly (including existing `paymentSchedule` derivation) into a reusable
  `DepartureFormFields` component. Reused by (a) the edit-time `DeparturesSection` and
  (b) a new optional "First departure (optional)" card on the Create Package form
  (admin-only, `isNew`).
- **Web (inline create)**: after `createPackage` succeeds, if a departure date was entered,
  POST one departure with `created.id` (same follow-up pattern as flyers/tags). Empty → skip.
- **Price-matrix layout**: three occupancy rows (Quad/Triple/Double) × two columns
  (Normal/Discounted); Quad-normal required, all others optional.
- **Payment schedule / DP**: unchanged — derived from the normal `priceQuad`
  (`[DP, Pelunasan = priceQuad − dpAmount]`).

## Key Trade-offs and Risks

- Partial-update discount without its normal price cannot be schema-compared → **theoretical only**:
  the edit-time UI only ever creates departures (no price-edit path; only "Adjust Seats"), so
  create schema always receives the full matrix. Cheap service-guard fix if a partial path appears.
- Inline departure POST fails after package created → non-atomic, same as existing flyers/tags flow;
  package persists as draft, admin can add departure from editor. Error shown near the action.
- Migration adds three nullable columns to a populated table → additive, no default, reversible.

## Testing Strategy

- Shared unit spec: discount refine accepts valid matrix, rejects discount-above-normal, allows omit.
- API integration spec: discount fields persist/round-trip; above-normal discount rejected.
- Gate: `bun run verify` (typecheck + lint + test) and `bun run test:int`.

## Spec Patches

None — the delta spec already covers the discount rule and the three inline-create scenarios.
No acceptance-scenario gaps found.
