---
comet_change: confirm-dialog-and-session-redirect
role: technical-design
canonical_spec: openspec
archived-with: 2026-07-07-confirm-dialog-and-session-redirect
status: final
---

# Design: confirm-dialog-and-session-redirect

Technical design for two web-client UX-safety capabilities delivered in one change:
`destructive-action-confirmation` (a reusable confirmation dialog) and `session-expiry-redirect`
(global 401 → login handling). Canonical requirements live in the OpenSpec delta specs; this doc
covers HOW.

## Context

`apps/web` is Next.js (App Router) + TanStack Query + a single shared ky instance
(`src/lib/api.ts`). Two cross-cutting gaps:

- **Destructive actions are gated inconsistently:** `packages/[id]` uses native `window.confirm`,
  `providers/[id]` has a bespoke hand-rolled deactivate modal, and master-data / category / user /
  template deletes fire immediately on click. Available UI primitives are only `button`, `card`,
  `input`, `label` — no dialog primitive exists.
- **Session expiry is unhandled:** the ky instance has no 401 hook and the `QueryClient`
  (`src/components/providers.tsx`) has no global error handler, so an expired session shows a
  generic inline error with no recovery path. `useLogout` (`src/hooks/use-auth.ts`) already models
  the "clear session hint → drop `me` query → go to `/login`" sequence.

## Goals / Non-Goals

**Goals:**
- One reusable, accessible confirmation dialog gating every destructive action app-wide.
- One global 401 → `/login` redirect with return-URL preservation and a session-expired notice.
- Consistent behavior; remove native `window.confirm` and the bespoke deactivate modal.

**Non-Goals:**
- No `apps/api` / `packages/*` changes; token lifetime and RBAC unchanged.
- No redirect on `403` — forbidden stays an inline error.
- No confirmation on non-destructive actions (save, activate, edit).
- No login-page redesign beyond the notice + return-URL wiring.

## Decisions

### D1 — Confirmation dialog: imperative `useConfirm()` over a single provider

**Chosen:** an app-root `<ConfirmProvider>` holds ONE `AlertDialog` instance; `useConfirm()` returns
`confirm(opts) => Promise<boolean>`. Rationale: ~6 simple delete sites collapse to
`if (await confirm({...})) await mutation.mutateAsync(id)` with no per-site `open`/pending-target
state. Rich content (provider deactivate's affected-packages list) is still supported because
`description` is a `ReactNode`.

**Alternatives considered:** declarative controlled `<ConfirmDialog>` per site (more boilerplate at
each of 6+ sites); hybrid (imperative for simple + raw primitive for rich) — rejected as unnecessary
since `ReactNode` description already covers the rich case.

**Components (all `apps/web`):**
- `src/components/ui/alert-dialog.tsx` — shadcn `AlertDialog` primitive over
  `@radix-ui/react-alert-dialog`; theme tokens + dark mode, matching existing primitives.
- `src/components/confirm-provider.tsx` — renders one `AlertDialog`, owns its open state + the
  currently pending options + the promise resolver; provides context. Mounted inside `Providers`
  (under the QueryClient) so it wraps the whole app.
- `src/hooks/use-confirm.ts` — `useConfirm()` reads context; returns `confirm`.

```ts
type ConfirmOptions = {
  title: string;
  description?: ReactNode;   // ReactNode → impact lists / custom bodies
  confirmLabel?: string;     // default "Confirm"
  cancelLabel?: string;      // default "Cancel"
  destructive?: boolean;     // default true → destructive button styling
};
// confirm(opts): opens dialog, returns Promise<boolean>.
// Confirm → resolve(true); Cancel / Esc / outside-click → resolve(false).
```

Single-instance is acceptable: destructive actions are user-sequential.

### D2 — 401 handling: pure decision helper + hard redirect in the ky layer

**Chosen:** a ky `beforeError` hook in `src/lib/api.ts`. The decision is a pure, testable helper:

```ts
shouldRedirectOnUnauthorized({ status, requestUrl, currentPath }): boolean
// true iff status === 401 && !requestUrl.includes("auth/login") && currentPath !== "/login"
```

On `true`: `clearSessionHint()` then `window.location.assign("/login?returnUrl=<enc currentPath>&expired=1")`.
The full-page navigation wipes the QueryClient cache, so no React Router / QueryClient access is
needed from the hook. `403` and login-endpoint `401`s fall through untouched to the existing
`readApiError` path.

**Alternatives considered:** soft redirect via a module-level event emitter + a root listener doing
`queryClient.removeQueries` + `router.push` — smoother (no reload) but more moving parts and more
loop surface; rejected because the session is already dead, so a reload is a non-issue.

### D3 — Return-URL consumption + open-redirect safety

`src/app/login/page.tsx` currently hardcodes `router.push("/dashboard")` on success. Change:
- Read `returnUrl` + `expired` from `window.location.search` (the page is already a client
  component; reading `window.location` avoids the Next `useSearchParams` Suspense-boundary
  requirement).
- When `expired=1`, render a session-expired notice (`role="status"`/inline, sentence-case copy).
- On success, `router.push(safeReturnUrl(returnUrl))`.

```ts
safeReturnUrl(raw: string | null): string
// returns raw only when it is a same-origin path starting with a single "/"
// (rejects "//host", "http(s)://…", and "/login"); otherwise "/dashboard".
```

### D4 — Call-site migration list (destructive actions)

| File | Action(s) | Change |
| --- | --- | --- |
| `dashboard/settings/master-data/page.tsx` | delete airline, delete city | gate via `useConfirm` |
| `dashboard/providers/[id]/page.tsx` | deactivate (impact list), delete category | replace bespoke modal → `confirm` w/ ReactNode impact list; gate category delete |
| `dashboard/packages/[id]/page.tsx` | delete departure schedule, unpublish | replace `window.confirm`; gate unpublish |
| `dashboard/users/page.tsx` | deactivate user | gate via `useConfirm` |

Verified inventory (2026-07-07): the destructive actions are the 7 above. **Templates have no
destructive action** (only update) and are excluded. Users have **no hard delete** — only
`deactivateUser` (a destructive state change, in scope). `useDeletePackage` / `useDeleteProvider`
hooks exist but are currently unused (no call site), so nothing to wire. Each migration preserves the
site's existing mutation call and error handling; only the confirmation gate changes. A final sweep
confirms no destructive call fires without the dialog.

## Testing strategy

DB-free unit specs (`*.spec.ts`, run in `bun run verify`) on the pure helpers:
- `shouldRedirectOnUnauthorized` — 401 on a dashboard request → true; 401 on `auth/login` → false;
  401 while `currentPath === "/login"` → false; 403 → false.
- `safeReturnUrl` — a normal `/dashboard/x` path passes; `//evil.com`, `http://evil.com`, `/login`,
  `""`/null → `/dashboard`.

Manual acceptance covers the five delta-spec scenarios plus the open-redirect boundary. The dialog
and login UI are thin wrappers — not worth brittle DOM tests.

## Risks / Trade-offs

- **Redirect loop** → helper excludes `auth/login` and the `/login` route; hard nav guarantees a
  clean slate.
- **Open redirect** → `safeReturnUrl` allow-list (same-origin single-slash paths only).
- **Broad blast radius (6+ sites)** → migrate one at a time, preserving existing mutation/error
  handling per site.
- **Full-reload flash on expiry** → accepted; the session is already gone.
- **New dependency** → `@radix-ui/react-alert-dialog` (latest resolved version) declared in
  `apps/web/package.json` (bun's isolated linker does not hoist).

## Accepted limitations (from end-of-build code review, 2026-07-07)

- **Provider deactivate confirms *after* the mutation.** `handleDeactivateClick` calls
  `deactivateProvider.mutateAsync(id)` before opening the dialog, because the affected-packages
  impact list comes from the mutation response. Consequently, clicking **Cancel** does not undo the
  deactivation (matching the previous bespoke-modal behavior). Accepted as a known limitation for
  this change; a true preview-before-commit would need a separate "compute impact without
  deactivating" API and is deferred to a follow-up. The related cosmetic gap (no success message on
  Cancel) is accepted with it.
- The `confirm-provider` resolution relies on Radix's Action/Cancel `onClick` firing before
  `onOpenChange(false)` (standard shadcn pattern); left as-is.

## Open Questions

None — both architectural forks (dialog API, redirect execution) are resolved and confirmed.
