# Comet Design Handoff

- Change: confirm-dialog-and-session-redirect
- Phase: design
- Mode: compact
- Context hash: f997db85f5f1ed565213d38b602ab7a1a3f71846e992dc93e907bfcc9945e0ec

Generated-by: comet-handoff.sh

OpenSpec remains the canonical capability spec. This handoff is a deterministic, source-traceable context pack, not an agent-authored summary.

## openspec/changes/confirm-dialog-and-session-redirect/proposal.md

- Source: openspec/changes/confirm-dialog-and-session-redirect/proposal.md
- Lines: 1-55
- SHA256: cae297cd9e76ed7af1c4231f5bd484d9e4865043d3cbbe10edc99cec80887e8b

```md
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
```

## openspec/changes/confirm-dialog-and-session-redirect/design.md

- Source: openspec/changes/confirm-dialog-and-session-redirect/design.md
- Lines: 1-63
- SHA256: fd34b323ff57cb1dc3fc6a35235668bba930e088d6b3b053500eeee26deab451

```md
## Context

The web app (`apps/web`, Next.js App Router + TanStack Query + ky) has two cross-cutting UX-safety
gaps. Destructive actions are gated inconsistently: `packages/[id]` uses native `window.confirm`,
`providers/[id]` has a bespoke hand-rolled modal for deactivate, and master-data / category / user /
template deletes fire immediately. Session expiry is unhandled: the shared ky instance
(`src/lib/api.ts`) has no 401 hook and the `QueryClient` (`src/components/providers.tsx`) has no
global error handler, so an expired session shows a generic inline error with no recovery path.

Available UI primitives are limited to `button`, `card`, `input`, `label` — there is no dialog
primitive yet. `useLogout` already models the "clear session hint → remove `me` query → push
`/login`" sequence that the 401 handler will reuse.

This is a high-level design; the detailed component API, exact hook wiring, and delta specs are
produced in the `/comet-design` phase.

## Goals / Non-Goals

**Goals:**
- One reusable, accessible confirmation dialog gating every destructive action app-wide.
- One global 401 → login redirect with return-URL preservation and a session-expired notice.
- Consistent behavior and copy; remove native `window.confirm` and the bespoke deactivate modal.

**Non-Goals:**
- No server-side auth changes (`apps/api` untouched); token lifetime and RBAC unchanged.
- No redirect on 403 — forbidden stays an inline error.
- No confirmation on non-destructive actions (save, activate, edit).
- No login-page redesign beyond the notice + return-URL handling.

## Decisions

- **Confirmation dialog: shadcn `AlertDialog` on `@radix-ui/react-alert-dialog`** (over hand-rolled).
  Rationale: accessible by default (focus trap, ESC, ARIA roles), matches the shadcn idiom the repo
  already follows, and the existing bespoke modal would otherwise re-own accessibility. Cost: one new
  dependency in `apps/web/package.json` (bun's isolated linker requires it declared there).
- **Component shape: a low-level `AlertDialog` primitive + a thin `ConfirmDialog` wrapper** exposing
  `{ title, description | children (impact slot), confirmLabel, variant: "destructive", onConfirm }`.
  The impact slot lets the provider-deactivate site render its affected-packages list inside the same
  dialog, replacing the bespoke modal.
- **401 handling centralized in the ky layer** (`src/lib/api.ts` `afterResponse`/`beforeError`
  hook) rather than per-call-site or only in the QueryClient — it catches both queries and mutations
  at the HTTP boundary. Redirect uses `window.location`/hard navigation (no React Router context in a
  ky hook). The handler reuses the `useLogout` sequence: clear session hint, drop the `me` query,
  navigate to `/login?returnUrl=<current path>`.
- **Exclusions to avoid loops / false positives:** the 401 hook skips requests to `auth/login`
  (bad-password 401 is a normal credential error) and does not fire when already on `/login`. Only
  `401` triggers redirect; `403` passes through untouched.
- **Return URL:** captured from the current location at redirect time, echoed on `/login`, and
  consumed by the login success handler to navigate back (falling back to the default dashboard when
  absent or pointing at `/login`).

## Risks / Trade-offs

- **Broad blast radius (many call sites)** → migrate one call site at a time; keep each destructive
  action's existing mutation/error handling, only swapping the confirmation gate.
- **Redirect loops** → hard exclusion of `auth/login` and the `/login` route; the login page never
  triggers the interceptor.
- **401 vs 403 confusion** → interceptor branches strictly on status 401; 403 is never redirected.
- **ky hook cannot access React state/router** → use `window.location` for navigation and read the
  return path from `window.location` at hook time; keep client session-hint clearing consistent with
  `useLogout`.
- **New dependency** → `@radix-ui/react-alert-dialog` pinned to the latest resolved version, declared
  in `apps/web/package.json`.
```

## openspec/changes/confirm-dialog-and-session-redirect/tasks.md

- Source: openspec/changes/confirm-dialog-and-session-redirect/tasks.md
- Lines: 1-26
- SHA256: be8f509b6efa76ee720c14950385c3d527ef206905d5585713a062e3f66e9a9b

```md
## 1. Confirmation dialog primitive

- [ ] 1.1 Add `@radix-ui/react-alert-dialog` (latest resolved version) to `apps/web/package.json` and install
- [ ] 1.2 Create the `AlertDialog` primitive at `apps/web/src/components/ui/alert-dialog.tsx` in the shadcn idiom (theme tokens, dark mode)
- [ ] 1.3 Add a thin `ConfirmDialog` wrapper exposing `{ title, description | children, confirmLabel, destructive variant, onConfirm, onCancel, open state }`

## 2. Wire destructive actions to the dialog

- [ ] 2.1 Master data: gate airline + departure-city deletes (`dashboard/settings/master-data/page.tsx`) with `ConfirmDialog`, removing the immediate-fire path
- [ ] 2.2 Providers: replace the bespoke deactivate modal with `ConfirmDialog` and render the affected-packages impact list in its content slot (`dashboard/providers/[id]/page.tsx`)
- [ ] 2.3 Providers: gate category deletes with `ConfirmDialog` (same file)
- [ ] 2.4 Packages: replace native `window.confirm` for departure-schedule delete with `ConfirmDialog`, and gate package unpublish (`dashboard/packages/[id]/page.tsx`)
- [ ] 2.5 Users + templates: gate deletes (`dashboard/users/page.tsx`, `dashboard/settings/templates/page.tsx`)
- [ ] 2.6 Sweep for any remaining destructive call sites and confirm none fire without the dialog

## 3. Session-expiry redirect

- [ ] 3.1 Add a `401` handler in the ky layer (`src/lib/api.ts`) that clears the session hint, drops the `me` query, and redirects to `/login?returnUrl=<current path>`
- [ ] 3.2 Exclude `auth/login` requests and the `/login` route from the handler; ensure `403` is never redirected
- [ ] 3.3 Login page: read `returnUrl` + show the "session expired" notice (`src/app/login/page.tsx`); on successful login navigate to `returnUrl` (fallback to default dashboard when absent or `/login`)

## 4. Tests & verification

- [ ] 4.1 Add/adjust unit specs for the 401-handling decision logic (which statuses/endpoints redirect vs pass through)
- [ ] 4.2 Manual acceptance: run through all five acceptance scenarios (delete confirm, deactivate impact, session expiry + return, bad-password boundary, 403 boundary)
- [ ] 4.3 `bun run verify` passes (typecheck + lint + test)
```

## openspec/changes/confirm-dialog-and-session-redirect/specs/destructive-action-confirmation/spec.md

- Source: openspec/changes/confirm-dialog-and-session-redirect/specs/destructive-action-confirmation/spec.md
- Lines: 1-47
- SHA256: 2ad4256f756a265ba1d78bd8389c6e3b56fa9cae2569bf8320e36f87db5792a8

```md
## ADDED Requirements

### Requirement: Reusable confirmation dialog primitive

The web app SHALL provide a single reusable, accessible confirmation dialog primitive (built on
shadcn `AlertDialog` / `@radix-ui/react-alert-dialog`) that all destructive actions use. The dialog
SHALL accept a title, a description or rich content slot for action-specific details, a configurable
confirm-button label styled as destructive, and cancel/confirm handlers.

#### Scenario: Dialog is accessible

- **WHEN** the confirmation dialog opens
- **THEN** focus is trapped within the dialog, `Escape` cancels it, and it exposes an alert-dialog
  ARIA role with the title and description associated for assistive technology

#### Scenario: Cancel performs no action

- **WHEN** a user opens the confirmation dialog and chooses Cancel (or presses `Escape`, or clicks
  outside)
- **THEN** the dialog closes and the underlying destructive action does NOT run

### Requirement: All destructive actions are confirmed

The web app SHALL gate every irreversible action with the reusable confirmation dialog: deletes
(airlines, departure cities, provider categories, package departure schedules, users, templates),
provider deactivation, and package unpublish. No destructive action SHALL execute directly on click
without an intervening confirmation, and native `window.confirm` and the bespoke provider-deactivate
modal SHALL be removed in favor of the shared dialog.

#### Scenario: Delete requires confirmation

- **WHEN** an admin clicks Delete on a destructive item (e.g. an airline in master data)
- **THEN** the confirmation dialog appears identifying the item, and the item is deleted only after
  the user confirms

#### Scenario: Deactivate uses the shared dialog with impact details

- **WHEN** an admin clicks Deactivate on an active provider
- **THEN** the shared confirmation dialog appears rendering the affected-packages impact list in its
  content slot, and the provider is deactivated (with its packages unpublished) only after the user
  confirms

#### Scenario: No native confirm remains

- **WHEN** a user triggers the package departure-schedule delete
- **THEN** the shared confirmation dialog is shown instead of a native browser `window.confirm`
  prompt
```

## openspec/changes/confirm-dialog-and-session-redirect/specs/session-expiry-redirect/spec.md

- Source: openspec/changes/confirm-dialog-and-session-redirect/specs/session-expiry-redirect/spec.md
- Lines: 1-53
- SHA256: 96ebe82ec340271c9646435cf0ac5b05b38659153f771bd3ed9989d2cb7e4282

```md
## ADDED Requirements

### Requirement: Session expiry redirects to login

When any API request from the web client returns HTTP `401` (unauthenticated), the app SHALL clear
the client session hint, drop the cached `me` query, and redirect the user to `/login`. The redirect
SHALL preserve the user's current path as a `returnUrl` query parameter so the user can be returned
after re-authenticating.

#### Scenario: Expired session redirects with return URL

- **WHEN** a user on `/dashboard/packages/123` makes a request that returns `401`
- **THEN** the user is redirected to `/login` with `returnUrl` set to `/dashboard/packages/123` and
  the client session state is cleared

#### Scenario: Return to original page after re-login

- **WHEN** a user who was redirected with a `returnUrl` successfully logs in again
- **THEN** the app navigates the user back to the `returnUrl` (falling back to the default dashboard
  when the `returnUrl` is absent or points at `/login`)

#### Scenario: Return URL cannot be an open redirect

- **WHEN** the `returnUrl` is an absolute or external URL (e.g. `http://evil.com`, `//evil.com`) or
  points at `/login`
- **THEN** the app ignores it and navigates to the default dashboard after login

### Requirement: Session-expired notice on login

After a redirect caused by session expiry, the login page SHALL display a notice informing the user
that their session expired and they need to sign in again.

#### Scenario: Notice shown on expiry redirect

- **WHEN** a user lands on `/login` as a result of a `401`-triggered redirect
- **THEN** a "your session expired" notice is displayed on the login page

### Requirement: Login endpoint and 403 are excluded from redirect

The session-expiry handler SHALL NOT redirect for `401` responses from the `auth/login` endpoint, and
SHALL NOT fire when the user is already on `/login`. `403` (forbidden) responses SHALL NOT trigger a
redirect and SHALL surface as an inline error where the action occurred.

#### Scenario: Bad-password login is not treated as expiry

- **WHEN** a user submits wrong credentials on `/login` and the `auth/login` request returns `401`
- **THEN** the normal invalid-credentials error is shown, no "session expired" notice appears, and no
  redirect loop occurs

#### Scenario: Forbidden stays in place

- **WHEN** a request returns `403` because the user lacks permission
- **THEN** the app shows an inline error at the point of the action and does NOT redirect to login
```

