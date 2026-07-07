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
