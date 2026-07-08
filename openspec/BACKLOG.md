# Backlog — planned changes not yet opened

Shared, cross-tool roadmap. This file is the single source of truth for
work that is **planned but does not yet exist** as a Comet change on disk.
Both Claude Code and Google Antigravity read it (via `AGENTS.md`), so either
tool can answer "what's next?" identically.

**Scope boundary — do not duplicate disk state here:**

- **Active/open changes** live in `openspec/changes/<name>/` — detected by
  `openspec list` and `.comet.yaml`. Do NOT list them here.
- **Done changes** live in `openspec/changes/archive/`. Do NOT list them here.
- **This file = only what has not been opened yet.** When a backlog item is
  opened via `/comet-open`, remove it from this file (it now lives on disk).
  When you think of new future work, add it here.

---

## 1. `package-inclusions-exclusions-lists` — Create Package form revamp, batch #5 (NEXT)

Last remaining piece of the 5-change "Create Package form revamp" batch
(built in order 1→3→2→4→5; changes #1–#4 are archived under
`openspec/changes/archive/`).

**What:** Split the single package tag list into two separate
admin-managed lists — **inclusions** and **exclusions** — each with its own
tenant-global master table + admin UI (mirror the airlines / hotels catalog
pattern already shipped in batch #2 and #4), plus two corresponding sections
on the Create/Edit Package form.

**Key context to carry into design:**
- Master-table + admin-UI pattern to mirror: `hotels` / `airlines` modules
  (`apps/api/src/hotels`, admin UI under `dashboard/.../master-data`).
- Main form file: `apps/web/src/app/dashboard/packages/[id]/page.tsx`.
- Package schema: `packages/db/src/schema/packages.ts`; shared enums:
  `packages/shared/src/packages.ts`.
- User decision from original clarification: inclusions/exclusions get
  **new master tables + admin UI** (not free-text).

**Workflow:** full workflow (new tables + admin UI + form + search ⇒ not a
tweak/hotfix). Manual gating applies — stop after each task, review only at
the end.

---

## 2. `sliding-session` — rolling/idle-timeout session (future)

The API JWT is an **absolute 15-minute** expiry (`JWT_EXPIRES_IN` default
`15m` in `apps/api/src/config/env.ts`); the `cometkit_token` cookie is set
**only at login** (`apps/api/src/auth/auth.controller.ts`) with no refresh /
re-issue / sliding renewal. So an actively-working user is 401'd exactly
15 min after login regardless of activity.

**What:** an idle-timeout model — activity keeps the session alive, expire
only after idle. Two options to decide during design:
- **Rolling cookie (simplest):** on each authenticated request re-sign a
  fresh 15m token and re-set the cookie → active users never expire,
  15m idle → out.
- **Refresh token:** short access + longer refresh exchanged on 401
  (revocation, multi-device; more work).

Surfaced 2026-07-07 while building the confirm-dialog + session-redirect
change (now archived), which only handled the 401→login reaction. This is a
separate backend change.

---

## 3. Dashboard nav link to `/dashboard/search` (small follow-up)

Deferred follow-up from the `airline-departure-city-master-data` change: add
a navigation link to `/dashboard/search` from the dashboard nav. Small —
likely a `tweak`, not a full change.
