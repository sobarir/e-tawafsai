## 1. Confirmation dialog primitive

- [x] 1.1 Add `@radix-ui/react-alert-dialog` (latest resolved version) to `apps/web/package.json` and install
- [x] 1.2 Create the `AlertDialog` primitive at `apps/web/src/components/ui/alert-dialog.tsx` in the shadcn idiom (theme tokens, dark mode)
- [x] 1.3 Add a thin `ConfirmDialog` wrapper exposing `{ title, description | children, confirmLabel, destructive variant, onConfirm, onCancel, open state }` — implemented as imperative `useConfirm()` + `ConfirmProvider`

## 2. Wire destructive actions to the dialog

- [x] 2.1 Master data: gate airline + departure-city deletes (`dashboard/settings/master-data/page.tsx`) with `ConfirmDialog`, removing the immediate-fire path
- [ ] 2.2 Providers: replace the bespoke deactivate modal with `ConfirmDialog` and render the affected-packages impact list in its content slot (`dashboard/providers/[id]/page.tsx`)
- [ ] 2.3 Providers: gate category deletes with `ConfirmDialog` (same file)
- [ ] 2.4 Packages: replace native `window.confirm` for departure-schedule delete with `ConfirmDialog`, and gate package unpublish (`dashboard/packages/[id]/page.tsx`)
- [ ] 2.5 Users: gate the deactivate-user action (`dashboard/users/page.tsx`). (Templates have no destructive action — excluded.)
- [ ] 2.6 Sweep for any remaining destructive call sites and confirm none fire without the dialog

## 3. Session-expiry redirect

- [ ] 3.1 Add a `401` handler in the ky layer (`src/lib/api.ts`) that clears the session hint, drops the `me` query, and redirects to `/login?returnUrl=<current path>`
- [ ] 3.2 Exclude `auth/login` requests and the `/login` route from the handler; ensure `403` is never redirected
- [ ] 3.3 Login page: read `returnUrl` + show the "session expired" notice (`src/app/login/page.tsx`); on successful login navigate to `returnUrl` (fallback to default dashboard when absent or `/login`)

## 4. Tests & verification

- [ ] 4.1 Add/adjust unit specs for the 401-handling decision logic (which statuses/endpoints redirect vs pass through)
- [ ] 4.2 Manual acceptance: run through all five acceptance scenarios (delete confirm, deactivate impact, session expiry + return, bad-password boundary, 403 boundary)
- [ ] 4.3 `bun run verify` passes (typecheck + lint + test)
