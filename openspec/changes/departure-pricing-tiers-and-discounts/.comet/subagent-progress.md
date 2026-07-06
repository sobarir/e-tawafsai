# Subagent Progress Checkpoint

- Change: departure-pricing-tiers-and-discounts
- Plan: docs/superpowers/plans/2026-07-06-departure-pricing-tiers-and-discounts.md
- build_mode: subagent-driven-development
- tdd_mode: tdd
- Branch: feature/20260706/departure-pricing-tiers-and-discounts
- Branch base (merge-base main): 8b70c105f83bff0459ac72dca984a0869b5b0da3

## Current Task

- Plan task text: "## Task 1: Schema & migration (packages/db)"
- OpenSpec mapped tasks: tasks.md group 1 (1.1, 1.2)
- Stage: task-review
- Task base commit: 8b70c105f83bff0459ac72dca984a0869b5b0da3
- Implementation commit: 827dee6
- Changed files: packages/db/src/schema/departures.ts, drizzle/0014_careless_skaar.sql (+meta)
- RED/GREEN evidence: (n/a — pure DDL; verified via db:generate SQL + db:migrate apply + typecheck)
- Review stages passed: none
- Unresolved feedback: none
- Review-fix round: 0 / 3

## Task Ledger

- [ ] Task 1: Schema & migration (packages/db)
- [ ] Task 2: Shared contract + unit spec (packages/shared)
- [ ] Task 3: API mapper + payloads + integration spec (apps/api)
- [ ] Task 4: Web — reusable DepartureFormFields + editor wiring
- [ ] Task 5: Web — inline first departure on package create
- [ ] Task 6: Verify
