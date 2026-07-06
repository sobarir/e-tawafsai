## 1. Filter the Licensed Provider dropdown

- [x] 1.1 In `apps/web/src/app/dashboard/packages/[id]/page.tsx`, derive the
  selectable providers as `isActive || p.id === providerId` and render the
  Licensed Provider `<select>` options from that derived list.
- [x] 1.2 Update the new-package default-selection effect to pick the first
  **active** provider (leave blank when none are active) instead of `data[0]`.

## 2. Verify behavior

- [x] 2.1 Manually verify: create form lists only active providers and defaults
  to the first active one; editing a package whose provider is inactive keeps
  that provider visible/selected while other inactive providers stay hidden.
- [x] 2.2 Run `bun run verify` (typecheck + lint + test) and confirm it passes.
