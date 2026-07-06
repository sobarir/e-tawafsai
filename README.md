# e-tawafsai

A multi-tenant platform for **umrah & hajj travel agents** to run their
inventory and sales operation: register providers, build package catalogs,
manage dated departures with live seat inventory and pricing, search across
everything with the filters agents actually use, and follow up leads over
WhatsApp — all scoped per tenant (subdomain) so many agencies run on one
deployment.

Built as a Turborepo monorepo and developed through the spec-driven **Comet**
workflow (OpenSpec + Superpowers) on **Claude Code** and **Google Antigravity**.

## What it does

- **Providers** (`provider-management`) — a registry of PPIU/PIHK partners with
  licenses, accreditation, contact, logo, and default commission terms.
  Activation requires a license number and recorded price-publication consent.
- **Packages** (`package-catalog`) — tenant-scoped catalog of umrah packages
  (haji khusus/furoda are schema seams for a later phase) with product type,
  category, structured hotels-by-city, airline/flight route, inclusions,
  flyer-first entry (drag-drop / mobile camera), and draft→published→archived
  status.
- **Departures** (`departure-inventory`) — dated departures under a package with
  a full price matrix (quad/triple/double, plus optional discounted prices, all
  stored as integer minor units), atomic seat inventory
  (total/booked/held/available), DP amount and payment schedule, and automatic
  status transitions: `open → almost_full → full → departed`, with a dashboard
  surfacing departures that need pushing and those near closing.
- **Search** (`package-search`) — combined-filter admin search (max price by
  occupancy, month/date range, duration, category, airline, direct-only, hotel
  distance to Makkah/Madinah, min stars, departure city, provider,
  seats-available-only) plus full-text search, returning only packages with at
  least one departure satisfying every departure-level predicate.
- **Multi-tenancy** (`multi-tenancy`, `tenant-resolution`) — every business row
  carries a non-null `tenantId`; uniqueness is composite with the tenant; public
  traffic resolves the tenant by subdomain.
- **Tenant settings** (`tenant-settings`) — per-tenant Meta Pixel / Google Tag
  IDs, almost-full threshold, hold-expiry hours, follow-up intervals, extra WA
  numbers, brand identity, and an editable Indonesian message-template library
  (greeting, price quote, DP/H-60/H-30 reminders, document checklist,
  testimonial ask) with validated `{variable}` placeholders.
- **Auth & RBAC** (`authentication`, `user-management`) — JWT auth with roles
  read fresh from the DB per request; admin user management.

Specs of record live in `openspec/specs/`; in-flight and archived changes live in
`openspec/changes/` (and `openspec/changes/archive/`).

## Stack

All dependencies track `@latest` (Next 16, React 19, TypeScript 6, Zod 4,
Vitest 4, ESLint 10 at the time of writing).

- **Monorepo**: Turborepo + bun workspaces
- **API** (`apps/api`): NestJS on the Fastify adapter, Passport + JWT auth with
  roles (RBAC), pino logging with ULID request ids, uniform error envelope, Zod
  validation
- **Web** (`apps/web`): Next.js App Router, Tailwind v4 + shadcn-style UI,
  TanStack Query + ky API client, auth pages, dashboard
- **Database** (`packages/db`): Drizzle ORM + drizzle-kit, postgres-js, **ULID
  primary keys** on every table (app-side generation, no extensions)
- **Shared** (`packages/shared`): the API contract — Zod schemas, DTOs, roles,
  enums, error envelope — one source of truth for API and web

## Prerequisites

| Requirement                         | Why                                    |
| ----------------------------------- | -------------------------------------- |
| Node.js 20+ and bun                 | Runtime & package manager              |
| PostgreSQL **17+** running locally  | The database                           |
| git                                 | Version control                        |
| Git Bash (Windows only)             | Comet's workflow scripts need bash     |

## Getting started

```bash
git clone <this-repo> e-tawafsai
cd e-tawafsai

cp .env.example .env      # set DATABASE_URL and JWT_SECRET
bun install
bun run db:migrate        # ALWAYS before seed
bun run db:seed           # default tenant + demo accounts
bun run dev               # API on :3001, web on :3000
```

Open http://localhost:3000 and sign in with a seeded account
(`admin@e-tawafsai.dev` / `password123`).

## Day-to-day commands

| Command                          | What it does                              |
| -------------------------------- | ----------------------------------------- |
| `bun run dev`                    | Watch mode across the monorepo            |
| `bun run verify`                 | THE gate: typecheck + lint + unit tests   |
| `bun run test:int` (in apps/api) | Integration tests against local Postgres  |
| `bun run db:generate`            | Generate SQL migration after schema edits |
| `bun run db:migrate`             | Apply migrations (always before seed)     |
| `bun run db:seed`                | Seed default tenant + demo accounts       |

A change is not done until `bun run verify` passes.

## How work gets built (the Comet workflow)

Features are built through a five-phase, resumable pipeline driven by AI coding
agents. In Claude Code or Antigravity, type:

```
/comet "agents can attach a testimonial to a completed departure"
```

Phase by phase (your involvement in bold):

1. **Open** — a grilling interview stress-tests the idea; the OpenSpec proposal,
   delta spec, and task list are generated. **You approve the proposal.**
2. **Design** — Superpowers brainstorming produces the design doc and plan.
   **You review key decisions.**
3. **Build** — TDD execution following `docs/FEATURE_PATTERN.md`: contract in
   `shared` → schema + migration in `db` → API module → web hooks + page.
4. **Verify** — runs `bun run verify` plus code review. **You see the report.**
5. **Archive** — the delta spec is merged into `openspec/specs/` and the change
   is archived under `openspec/changes/archive/`.

Shortcuts for small work: `/comet-hotfix` (skip brainstorming) and `/comet-tweak`
(skip brainstorming and the full plan).

### Resuming later — "where are we now?"

State lives on disk, not in the chat. In the agent, type `/comet` (or ask
"where are we now?"); in the terminal, `comet status`. The agent reconstructs the
active change, phase, remaining tasks, and next command from `.comet.yaml`, the
task checkboxes in `openspec/changes/`, and git.

## Reference API

| Method | Path             | Access    | Notes                       |
| ------ | ---------------- | --------- | --------------------------- |
| POST   | `/auth/register` | public    | Returns user + JWT          |
| POST   | `/auth/login`    | public    | Returns user + JWT          |
| GET    | `/auth/me`       | signed in | Fresh role on every request |
| PATCH  | `/users/me`      | signed in | Update own profile          |
| GET    | `/users`         | admin     | Paginated list              |
| POST   | `/users`         | admin     | Create user with role       |
| PATCH  | `/users/:id`     | admin     | Update name/role            |
| DELETE | `/users/:id`     | admin     | 204; refuses self-delete    |
| GET    | `/health`        | public    | Liveness                    |

The auth + user-management modules are the **worked example** every new feature
copies structurally. Extend, don't rebuild.

## Conventions (summary — `AGENTS.md` is authoritative)

- **Wire shapes** (Zod request schemas + response types) live in
  `packages/shared`; **columns** live in `packages/db`; shared enums/constants
  live in `shared` and the Drizzle `pgEnum` derives from them. Dependency
  direction: `shared ← db ← api`, `shared ← web` — never reversed.
- **ULID primary keys**: `ulidPk()` per table, `ulidRef()` for FKs; `char(26)`,
  app-side, time-ordered. Spread `...timestamps` into every table.
- **Errors**: one envelope (`ApiErrorBody`) from the global exception filter,
  consumed on the web via `readApiError`.
- **Logging**: pino; services log domain events (`user.created`) with ids, never
  secrets; ULID request-ids correlate everything.
- **UI**: shadcn-idiom components in `apps/web/src/components/ui`; design tokens
  in `globals.css`; `npx shadcn add <component>` works.

## Agent platforms

The canonical agent guide is `AGENTS.md` — Claude Code imports it via
`CLAUDE.md`, Antigravity reads it natively. Skills live in both `.claude/skills/`
and `.agents/skills/` (same SKILL.md format). Read `AGENTS.md` (DRY boundaries,
error envelope, logging, testing, gotchas) and `docs/FEATURE_PATTERN.md` (the
vertical-slice recipe) before building.
