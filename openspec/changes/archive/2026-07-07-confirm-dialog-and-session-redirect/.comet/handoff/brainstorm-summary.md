# Brainstorm Summary

- Change: confirm-dialog-and-session-redirect
- Date: 2026-07-07

## Confirmed Technical Approach

**Confirmation dialog (`destructive-action-confirmation`):**
- `src/components/ui/alert-dialog.tsx` — shadcn `AlertDialog` primitive over
  `@radix-ui/react-alert-dialog` (theme tokens + dark mode).
- `src/components/confirm-provider.tsx` — single `<ConfirmProvider>` mounted inside `Providers`
  (under QueryClient); holds one AlertDialog instance + state via context.
- `src/hooks/use-confirm.ts` — `useConfirm()` returns `confirm(opts) => Promise<boolean>`.
- `ConfirmOptions = { title, description?: ReactNode, confirmLabel?, cancelLabel?, destructive? }`.
  `description` is a ReactNode so the provider-deactivate impact list renders inside the same dialog.
- Call sites become `if (await confirm({...})) await mutation.mutateAsync(id)`.
- Removes native `window.confirm` (packages departure delete) and the bespoke provider deactivate
  modal (folds its affected-packages list into `description`).

**Session-expiry redirect (`session-expiry-redirect`):**
- `src/lib/api.ts` gains a ky `beforeError` hook.
- Pure helper `shouldRedirectOnUnauthorized({status, requestUrl, currentPath}): boolean` — true only
  when `status===401 && !requestUrl.includes("auth/login") && currentPath !== "/login"`.
- On true: `clearSessionHint()` then hard nav `window.location.assign("/login?returnUrl=<enc>&expired=1")`.
  Full reload wipes QueryClient cache; no React context needed.
- 403 and login-endpoint 401s fall through to existing `readApiError` handling.
- `src/app/login/page.tsx`: read `returnUrl` + `expired` from `window.location.search` (avoids the
  Next `useSearchParams` Suspense-boundary gotcha); show session-expired notice when `expired=1`;
  on success navigate to `safeReturnUrl(returnUrl)` instead of hardcoded `/dashboard`.
- Pure helper `safeReturnUrl(raw)`: allow only same-origin path starting with a single `/`
  (reject `//host`, `http://…`, `/login`) else `/dashboard`.

## Key Trade-offs and Risks

- Imperative `useConfirm()` over declarative component → minimal per-site boilerplate for 6+ sites;
  rich content still possible via ReactNode description. Single dialog instance (sequential actions).
- Hard `window.location` redirect over soft event-bridge → simplest, loop-proof, one file; costs a
  full reload (acceptable — session is already gone).
- Redirect loop risk → helper excludes `auth/login` + `/login`.
- Open-redirect risk → `safeReturnUrl` allow-list.
- Broad blast radius (6+ call sites) → migrate one at a time, preserve each site's mutation/error
  handling.
- New dependency `@radix-ui/react-alert-dialog` (latest resolved) declared in `apps/web/package.json`.

## Testing Strategy

- DB-free unit specs on the pure helpers:
  - `shouldRedirectOnUnauthorized` — 401 dashboard=redirect; 401 auth/login=no; 401 on /login=no; 403=no.
  - `safeReturnUrl` — valid path passes; `//evil.com`, `http://…`, `/login`, empty → `/dashboard`.
- Manual acceptance for the 5 scenarios (+ open-redirect boundary). Dialog UI is thin — no brittle
  DOM tests.
- `bun run verify` must pass.

## Spec Patches

Add one boundary scenario to `session-expiry-redirect` spec (return-URL requirement):
> Scenario: Return URL cannot be an open redirect — WHEN returnUrl is absolute/external or points at
> /login THEN the app ignores it and navigates to the default dashboard after login.
Scope: supplements a boundary condition only; no structural rewrite.
