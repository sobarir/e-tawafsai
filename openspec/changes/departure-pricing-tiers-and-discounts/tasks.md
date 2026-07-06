## 1. Schema & migration (packages/db)

- [x] 1.1 Add `priceQuadDiscount`, `priceTripleDiscount`, `priceDoubleDiscount` (nullable integer) to the `departures` table in `packages/db/src/schema/departures.ts`
- [x] 1.2 Run `bun run db:generate` to emit the migration, then `bun run db:migrate` to apply it

## 2. Shared contract (packages/shared)

- [ ] 2.1 Add the three discounted fields to `createDepartureSchema` (`z.number().int().positive().nullable().optional()`) in `packages/shared/src/departures.ts`
- [ ] 2.2 Add a `superRefine` enforcing each discounted price `≤` its normal counterpart when both are present, emitting a field-level error on the discount path
- [ ] 2.3 Add the three fields to the `DepartureDto` interface
- [ ] 2.4 Add/extend unit spec (`departures.spec.ts`) covering: valid matrix accepted, discount-above-normal rejected, discounts omitted accepted

## 3. API (apps/api/src/departures)

- [ ] 3.1 Extend `toDepartureDto` to map the three discount columns (mirroring `priceTriple`/`priceDouble`, `?? null`)
- [ ] 3.2 Extend the create payload and the partial-update payload in `departures.service.ts` to carry the three fields
- [ ] 3.3 Extend the integration spec (`departures.service.int.spec.ts`) to assert the discount fields persist and round-trip, and that an above-normal discount is rejected

## 4. Web — departure editor (apps/web)

- [ ] 4.1 Add triple & double normal price inputs to the `DeparturesSection` add-departure form
- [ ] 4.2 Add quad/triple/double discounted price inputs to the same form and include them in the create payload
- [ ] 4.3 Show discounted prices in the departure card pricing row

## 5. Web — inline first departure on create (apps/web)

- [ ] 5.1 Add an optional "First departure (optional)" block to the Create Package form with date, return date, seats, DP, and the full quad/triple/double normal & discounted matrix (admin-only, only when `isNew`)
- [ ] 5.2 On submit, when a departure date is present, POST one departure using the created package id after `createPackage` succeeds (same follow-up pattern as flyers/tags); skip cleanly when empty
- [ ] 5.3 Surface departure validation/creation errors via `readApiError` near the create action

## 6. Verify

- [ ] 6.1 Run `bun run verify` (typecheck + lint + test) and `bun run test:int` for the departures integration path; confirm all green
