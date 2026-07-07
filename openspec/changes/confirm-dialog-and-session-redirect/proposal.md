## Why

Two cross-cutting UX-safety gaps in the web app risk data loss and confusing dead-ends:
destructive actions (delete, deactivate, unpublish) fire inconsistently — some behind a native
`window.confirm`, one behind a bespoke modal, and several with no confirmation at all — while an
expired session surfaces only as a generic inline error with no path back to a working state. This
change closes both gaps with one reusable confirmation dialog and one global session-expiry
redirect.

## What Changes

- Add a reusable, accessible confirmation dialog (shadcn `AlertDialog`, built on
  `@radix-ui/react-alert-dialog`) as a new `apps/web/src/components/ui` primitive, supporting a
  title, rich description/children slot (e.g. an impact list), and a destructive confirm action.
- Route **every destructive action** in the web app through this dialog: master-data airline/city
  deletes, provider category deletes, provider **deactivate** (replacing the bespoke modal and
  folding in its affected-packages impact list), package departure-schedule deletes (replacing the
  native `window.confirm`), package **unpublish**, user deletes, and template deletes.
- Add global session-expiry handling: any `401` response redirects the user to `/login`, preserving
  the current path as a `returnUrl`, and the login page shows a "your session expired" notice; after
  re-login the user is returned to `returnUrl`.
- The `401` interceptor **excludes the `auth/login` endpoint** so a bad-password login (which also
  returns 401) shows the normal invalid-credentials error — no "session expired" notice, no redirect.
- `403` (forbidden) is explicitly **out of scope** for redirect: it stays as an inline error where
  it occurs.

## Capabilities

### New Capabilities
- `destructive-action-confirmation`: a shared confirmation dialog that gates every irreversible
  action (delete, deactivate, unpublish) in the web app, with a consistent look, accessible
  behavior, and support for action-specific impact details.
- `session-expiry-redirect`: global handling of authentication expiry on the web client — 401
  responses redirect to login with a return URL and a session-expired notice, while excluding the
  login endpoint and leaving 403 in place.

### Modified Capabilities
<!-- None. Server-side authentication behavior (login/logout/JWT) is unchanged; this change is
     confined to web-client UX. -->

## Impact

- **Affected code (apps/web only):**
  - New: `src/components/ui/alert-dialog.tsx` (+ a thin `ConfirmDialog` wrapper if warranted).
  - Wiring: `dashboard/settings/master-data/page.tsx`, `dashboard/providers/[id]/page.tsx`,
    `dashboard/packages/[id]/page.tsx`, `dashboard/users/page.tsx`,
    `dashboard/settings/templates/page.tsx`, and any other destructive call sites.
  - Session expiry: `src/lib/api.ts` (ky `afterResponse`/`beforeError` 401 hook), possibly
    `src/components/providers.tsx` (QueryClient cache handler), and `src/app/login/page.tsx`
    (returnUrl + session-expired notice).
- **Dependencies:** adds `@radix-ui/react-alert-dialog` to `apps/web` (declared in its
  `package.json`; bun's isolated linker does not hoist).
- **APIs / DB / packages:** none — no changes to `apps/api` or `packages/*`.
- **Risk:** touches many call sites; the redirect must avoid loops (exclude `/login` and
  `auth/login`) and correctly distinguish 401 from 403.
