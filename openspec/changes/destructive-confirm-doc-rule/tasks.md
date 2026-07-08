# Tasks

- [x] 1. Add the "destructive actions must confirm" convention bullet to the
      **Frontend conventions** section of `AGENTS.md`, referencing the shipped
      `useConfirm()` / `ConfirmProvider` API (title/description/confirmLabel/
      cancelLabel/destructive options) with a one-line usage snippet.
- [ ] 2. Verify: `bun run verify` still passes (docs change should not affect
      it) and confirm the referenced symbols/paths (`@/hooks/use-confirm`,
      `ConfirmProvider`) still exist as documented.
