## Why

The `confirm-dialog-and-session-redirect` change (archived 2026-07-07) shipped
an app-wide confirmation primitive (`useConfirm()` / `ConfirmProvider`) and
retrofitted every existing destructive action to use it. But the original
request had two halves: retrofit today's sites **and** make future builds
inherit "destructive actions must confirm" by default. The second half — a
written convention in `AGENTS.md` — was never recorded, so the guarantee lives
only in already-written code and will erode as new delete/deactivate flows are
added by agents who don't know the primitive exists.

## What Changes

- Add one rule to the **Frontend conventions** section of `AGENTS.md`: every
  destructive action (delete, deactivate, or any irreversible mutation) must
  gate behind the shipped `useConfirm()` primitive before firing, rather than
  ad-hoc per-page dialogs or unconfirmed mutations.
- Reference the concrete API so agents can follow it: `useConfirm()` from
  `@/hooks/use-confirm` returns `confirm(opts): Promise<boolean>`; options are
  `title`, `description?`, `confirmLabel?`, `cancelLabel?`, `destructive?`
  (defaults `true`); provided app-wide by `ConfirmProvider`.

## Capabilities

### New Capabilities
<!-- none — documentation-only convention, no runtime capability -->

### Modified Capabilities
<!-- none — no spec-level behavior changes; this is a docs/convention edit -->

## Impact

- `AGENTS.md` (single file, Frontend conventions section).
- No code, dependency, API, or database changes. No delta spec.
- Downstream effect: future agent-built features inherit the confirm-on-destroy
  convention from the canonical guide read by Claude Code and Antigravity.
