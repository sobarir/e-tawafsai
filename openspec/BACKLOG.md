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

## 1. `sliding-session` — rolling/idle-timeout session (future)

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

## 2. Dashboard nav link to `/dashboard/search` (small follow-up)

Deferred follow-up from the `airline-departure-city-master-data` change: add
a navigation link to `/dashboard/search` from the dashboard nav. Small —
likely a `tweak`, not a full change.
