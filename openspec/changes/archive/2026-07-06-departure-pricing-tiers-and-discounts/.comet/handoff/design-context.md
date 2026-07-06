# Comet Design Handoff

- Change: departure-pricing-tiers-and-discounts
- Phase: design
- Mode: compact
- Context hash: 6b2eb4f0189e5e4ae885e0c1d3668884b18cca1b187f6a9efb8ced442041bdd9

Generated-by: comet-handoff.sh

OpenSpec remains the canonical capability spec. This handoff is a deterministic, source-traceable context pack, not an agent-authored summary.

## openspec/changes/departure-pricing-tiers-and-discounts/proposal.md

- Source: openspec/changes/departure-pricing-tiers-and-discounts/proposal.md
- Lines: 1-27
- SHA256: 7157cbe47348b8e96d43423accd50fad48941a09185173be8b00669127a9fa1b

```md
## Why

Admins cannot enter full departure pricing where they expect it. The *Create Package* form has no price or departure-date entry at all — departures (which own the date and price) only appear after the package is saved. Even then, the departure form exposes only the Quad price and DP, so the triple/double prices already in the schema are unreachable, and there is no way to record a promotional ("discounted") price alongside the normal one.

## What Changes

- Add an optional, nullable **discounted price per occupancy** to departures: `priceQuadDiscount`, `priceTripleDiscount`, `priceDoubleDiscount`. When present, each SHALL be a positive integer no greater than its normal counterpart.
- Expose **triple and double normal prices** in the departure entry form (columns already exist; only the UI is missing).
- Expose the three **discounted prices** in the departure entry form and show them in the departure card.
- Add an **optional inline "first departure"** block to the *Create Package* form so an admin can enter departure date + return date + the full quad/triple/double normal & discounted prices + seats/DP while creating a new package. If left blank, the package is created with no departures exactly as today.
- Keep the price matrix's existing rule that a departure SHALL NOT be `open` without `priceQuad`; discounted fields never gate publish or availability.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `departure-inventory`: the "Departure entity with price matrix" requirement gains the three nullable discounted-price fields and their `discount ≤ normal` validation; a new requirement covers creating an initial departure inline with a new package.

## Impact

- **Schema** (`packages/db/src/schema/departures.ts`): three new nullable integer columns + generated migration.
- **Shared contract** (`packages/shared/src/departures.ts`): request schema (Zod) and response type gain the discounted fields with cross-field validation.
- **API** (`apps/api/src/departures/*`): mapper + create/update paths carry the new fields; no seat-inventory, payment-schedule, or adjustment logic changes.
- **Web** (`apps/web/src/app/dashboard/packages/[id]/page.tsx`): triple/double/discount inputs in `DeparturesSection`; a new optional inline departure block on the create flow that posts a departure after the package is created.
- **Out of scope**: moving pricing onto the package; changing public search/`priceFrom` to use discounted prices; any change to seat inventory or payment milestones.
```

## openspec/changes/departure-pricing-tiers-and-discounts/design.md

- Source: openspec/changes/departure-pricing-tiers-and-discounts/design.md
- Lines: 1-51
- SHA256: 35cb77797d38e6a3a0dbf85b7b87a835a179a54fd215391043a189559576f9b4

```md
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
```

## openspec/changes/departure-pricing-tiers-and-discounts/tasks.md

- Source: openspec/changes/departure-pricing-tiers-and-discounts/tasks.md
- Lines: 1-33
- SHA256: 234de5cf0c8f3d18d46e443810c4b5791b63626532fd4f995e59a6e5db04f76e

```md
## 1. Schema & migration (packages/db)

- [ ] 1.1 Add `priceQuadDiscount`, `priceTripleDiscount`, `priceDoubleDiscount` (nullable integer) to the `departures` table in `packages/db/src/schema/departures.ts`
- [ ] 1.2 Run `bun run db:generate` to emit the migration, then `bun run db:migrate` to apply it

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
```

## openspec/changes/departure-pricing-tiers-and-discounts/specs/departure-inventory/spec.md

- Source: openspec/changes/departure-pricing-tiers-and-discounts/specs/departure-inventory/spec.md
- Lines: 1-37
- SHA256: 02f424e8ced0e643dc79bc71af6a6dcfdd076c8eb3444b00ddc10a59ed40153d

```md
## MODIFIED Requirements

### Requirement: Departure entity with price matrix
The system SHALL provide CRUD for Departures under a Package with: `departureType` (`fixed_date`|`estimated_year`; only `fixed_date` accepted until C18), `departureDate`, `returnDate`, `seatTotal`, `seatBooked`, `seatHeld`, computed `seatAvailable`, `currency` (`IDR`|`USD`, default `IDR`), `priceQuad`, `priceTriple` (nullable), `priceDouble` (nullable), `priceQuadDiscount` (nullable), `priceTripleDiscount` (nullable), `priceDoubleDiscount` (nullable), `dpAmount`, `paymentSchedule`, `status`, `notes`. Prices SHALL be stored as integers in minor units. Each discounted price, when provided, SHALL be a positive integer no greater than its normal counterpart, and SHALL be rejected with a field-level error otherwise. A departure SHALL NOT be `open` without `priceQuad`; discounted prices SHALL never gate `open` status or availability.

#### Scenario: Create departure with full price matrix
- **WHEN** an admin adds a departure with date, seatTotal 45, quad/triple/double normal prices, and quad/triple/double discounted prices each below their normal price
- **THEN** it is saved with `seatAvailable = 45`, status `open`, and all six price fields persisted

#### Scenario: Discounted price above normal rejected
- **WHEN** an admin submits a departure whose `priceTripleDiscount` exceeds `priceTriple`
- **THEN** the request is rejected with a field-level error and nothing is persisted

#### Scenario: Discounted prices optional
- **WHEN** an admin adds a departure with only normal prices and no discounted prices
- **THEN** it is saved with the discounted fields null and status `open`

#### Scenario: estimated_year rejected in Phase 1
- **WHEN** a departure specifies `departureType = estimated_year`
- **THEN** the request is rejected (seam unlocks with C18)

## ADDED Requirements

### Requirement: Inline first departure on package creation
The Create Package form SHALL offer an optional departure entry (date, return date, seats, DP, and the full quad/triple/double normal & discounted price matrix). When the admin completes it, the system SHALL create that departure immediately after the package is created. When the departure entry is left empty, the package SHALL be created with no departures, preserving draft-first creation. Departure entry made inline SHALL be validated by the same rules as the standalone departure form.

#### Scenario: Package created with an inline departure
- **WHEN** an admin creates a new package and fills the inline departure with a date and at least a quad price
- **THEN** the package is created and exactly one departure exists for it with the entered prices

#### Scenario: Package created without a departure
- **WHEN** an admin creates a new package and leaves the inline departure entry empty
- **THEN** the package is created with zero departures and no validation error is raised

#### Scenario: Invalid inline departure blocks creation feedback
- **WHEN** an admin fills the inline departure with a discounted price above its normal price
- **THEN** a field-level error is surfaced and the departure is not created
```

