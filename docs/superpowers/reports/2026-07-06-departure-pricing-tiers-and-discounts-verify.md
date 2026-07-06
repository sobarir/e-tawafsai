# Verification Report — departure-pricing-tiers-and-discounts

- Date: 2026-07-06
- Change: departure-pricing-tiers-and-discounts
- Branch: feature/20260706/departure-pricing-tiers-and-discounts
- Verify mode: full (16 tasks, 22 changed files, 1 delta capability)
- Design doc: docs/superpowers/specs/2026-07-06-departure-pricing-tiers-and-discounts-design.md
- Plan: docs/superpowers/plans/2026-07-06-departure-pricing-tiers-and-discounts.md

## Result: PASS

## Fresh verification evidence (this session)

| Command | Result |
|---------|--------|
| `bun run build` | exit 0 — 4/4 turbo tasks (db, shared, api, web) |
| `bun run verify` (typecheck + lint + test) | exit 0 — 12/12 turbo tasks; shared unit tests 37/37 (incl. departures.spec 5/5) |
| `bun run test:int` (`--no-file-parallelism`) | exit 0 — 9 files / 35 tests (incl. departure discount persist/round-trip + schema-level rejection) |

Note: `test:int` uses `--no-file-parallelism` to avoid a PRE-EXISTING fixture race
(`ppiuLicenseNo: "PPIU-Test"` hardcoded in departures & packages int specs), which is
unrelated to and not introduced by this change.

## Full verification checklist

| # | Check | Status | Evidence |
|---|-------|--------|----------|
| 1 | All tasks.md tasks `[x]` | PASS | `grep -c '- [ ]' tasks.md` = 0 (16/16 checked) |
| 2 | Matches `design.md` high-level decisions | PASS | Whole-branch review confirmed decisions 1–5 (sibling nullable columns; shared `superRefine`; reuse create-departure endpoint post-package; date-presence "filled" detection; `DepartureFormFields` extraction) |
| 3 | Matches Design Doc | PASS | Three columns flow db→shared→api→web in lock-step; payment schedule still derived from normal `priceQuad` |
| 4 | All delta-spec scenarios pass | PASS | See scenario map below |
| 5 | proposal.md goals satisfied | PASS | discount fields added; triple/double normal + all discounts exposed in editor & card; optional inline first departure; open-requires-priceQuad rule intact |
| 6 | No delta-spec / design-doc drift | PASS | `git log 8b70c10..HEAD -- specs/` empty (delta spec untouched since design); Spec Patches: None |
| 7 | Design Doc locatable | PASS | file exists and links `comet_change` |

## Delta-spec acceptance scenario map

Capability `departure-inventory`:

- **Create departure with full price matrix** — PASS. `departures.service.int.spec.ts` creates with all six price fields and asserts `create()` return + `findOne()` round-trip.
- **Discounted price above normal rejected** — PASS. `departures.spec.ts` asserts field-level error on the discount path; int spec asserts `createDepartureSchema.safeParse` fails for above-normal.
- **Discounted prices optional** — PASS. `departures.spec.ts` "discounts omitted" case; columns + DTO are `number | null`.
- **estimated_year rejected in Phase 1** — PASS. Existing guard unchanged; no regression (covered by existing int test).
- **Inline first departure — package created with a departure** — PASS (static + review). Task 5 posts one departure with `created.id` after `createPackage`; verified by typecheck + lint + whole-branch review.
- **Inline — package created without a departure** — PASS (static + review). `buildPayload()` returns `null` when no departure date → POST skipped.
- **Inline — invalid inline departure blocks creation feedback** — PASS (static + review). Existing `try/catch` + `readApiError` surfaces the schema field error near the create action; package persists as draft.

Evidence level note: the three inline-create UI scenarios are verified by static analysis
(typecheck + lint) and the opus whole-branch code review with file:line confirmation, not by
an automated end-to-end runtime test (the plan defined none; the manual smoke check was optional).

## Whole-branch review

Opus final review verdict: **✅ ready to merge** — no Critical or Important findings;
cross-layer field-name/type consistency confirmed across db, shared schema, DTO, api
mapper/create/update, and web `buildPayload`; no regressions to seat inventory, status
lifecycle, payment schedule, or adjustment logic; integration + unit tests assert genuine
round-trip persistence and field-level rejection (no empty-assertion tests).

## Accepted non-critical items (recorded, not fixed in this change)

1. Inline-create is non-atomic (departure POSTed after package creation) — a failing departure
   leaves the package as a draft; a resubmit could create a second package. Design-accepted:
   identical to the existing flyers/tags follow-up pattern in the same handler.
2. Reusable numeric inputs (seatTotal/dpAmount/priceQuad) dropped the HTML `required` attribute;
   a cleared field coerces to 0 and the server rejects it. Low impact; from the plan template.
3. Shared spec has two near-duplicate positive cases and lacks explicit equality/absent-normal
   edge tests; the strict `>` comparison handles both correctly. Test-hygiene only.
4. Pre-existing (not introduced here): int specs hardcode `ppiuLicenseNo: "PPIU-Test"`, which
   races under parallel `test:int`. Follow-up: suffix it like other fixture fields.

## Security

No hardcoded secrets/keys introduced. No new unsafe operations. Discount validation is
server-enforced via the shared Zod schema; discounts never gate publish/availability.
