## Approach

Add a single bullet to the **Frontend conventions** section of `AGENTS.md`
(currently ends at the "Copy: sentence case…" bullet, line ~188). Place the new
rule alongside the existing UI-primitive and data-fetching conventions so it is
read in the same pass by any agent building a page.

The rule states the requirement and points at the shipped API so it is
actionable, not aspirational:

- **What:** destructive actions (delete, deactivate, any irreversible mutation)
  must confirm before firing.
- **How:** `const confirm = useConfirm()` (from `@/hooks/use-confirm`), then
  `if (!(await confirm({ title, description }))) return;` before the mutation.
  Options: `title`, `description?`, `confirmLabel?`, `cancelLabel?`,
  `destructive?` (defaults `true`). Provided app-wide by `ConfirmProvider` — no
  per-page dialog wiring.
- **Why:** guarantees future builds inherit confirm-on-destroy without
  rediscovering the primitive; avoids ad-hoc `window.confirm` or unconfirmed
  mutations.

## Scope guard

Documentation-only. No delta spec (no existing spec acceptance scenario
changes), no new dependency, no code edit. If review reveals the rule needs to
touch code or specs, that exceeds tweak scope and must upgrade to full workflow.
