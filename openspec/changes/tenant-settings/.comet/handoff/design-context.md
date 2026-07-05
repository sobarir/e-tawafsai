# Comet Design Handoff

- Change: tenant-settings
- Phase: design
- Mode: compact
- Context hash: f739ec440a94a90beced40f98f359a623e08b7f5b0309b98a84dbd61c8b26dc4

Generated-by: comet-handoff.sh

OpenSpec remains the canonical capability spec. This handoff is a deterministic, source-traceable context pack, not an agent-authored summary.

## openspec/changes/tenant-settings/proposal.md

- Source: openspec/changes/tenant-settings/proposal.md
- Lines: 1-30
- SHA256: 8b9144fc705ed88574df18d3c99ed66de86689997fffdc4cb42812486a604f49

```md
# Proposal: tenant-settings

## Why

Operational knobs and brand identity must be configurable per tenant rather than hardcoded (PRD C11), and C15 requires settings to be tenant-isolated from day one. Several Phase 1 behaviors (almost-full threshold) and Phase 2 seams (Pixel/Tag IDs, templates, hold expiry) read from here.

## What Changes

- Tenant-scoped settings storage and admin-only Settings UI covering: agent brand name/logo, WhatsApp number(s), Meta Pixel ID, Google Tag ID, almost-full threshold, hold expiry hours, default follow-up intervals per stage, and a message-templates editor.
- Phase 1 consumers wired: almost-full threshold → departure-inventory's status engine; brand/WA number → available to the search WhatsApp summary and future public site.
- Phase 2-consumer settings (Pixel/Tag IDs, hold expiry, follow-up intervals, templates) are stored and editable now, consumed when C6/C8/C9 land.
- Settings are admin-only (staff receives 403), per auth-rbac.

## Capabilities

### New Capabilities

- `tenant-settings`: typed per-tenant settings with defaults, admin-only management UI, and the read API used by consuming features.

### Modified Capabilities

(none)

## Impact

- `packages/shared`: settings schema (typed keys + validation, e.g. E.164 for WA numbers, positive int thresholds).
- `packages/db`: `tenant_settings` storage (model decided in design), migration + defaults seeding.
- `apps/api`: settings module (admin-only), cached read path for hot keys (threshold).
- `apps/web`: Settings screens incl. message-templates editor (mobile-first).
- Depends on: `multi-tenancy-foundation`, `auth-rbac`. Consumed by: `departure-inventory` (threshold) now; C6/C8/C9 later.
```

## openspec/changes/tenant-settings/design.md

- Source: openspec/changes/tenant-settings/design.md
- Lines: 1-39
- SHA256: da35a660d25557fca3ff8b6e9c0b0715fa542683374fd2d05a53d8a21bd20b69

```md
# Design: tenant-settings

## Context

Settings span identity (brand), integration IDs (Pixel/Tag), operational thresholds, and content (message templates). Consumers range from hot paths (threshold read on every seat mutation) to Phase 2 features. The tenant row itself (multi-tenancy-foundation) already holds brandName/logo/waNumber — this change decides what lives on `tenants` vs a settings store and provides the single management UI for both.

## Goals / Non-Goals

**Goals:**
- One typed, validated settings surface per tenant with sensible defaults (a tenant with zero rows behaves correctly).
- Admin-only access; structural staff 403.
- Cheap reads for hot keys; no cache-invalidation complexity beyond a simple per-request or short-TTL cache.

**Non-Goals:**
- Platform-level settings, plan/billing fields (C16). Template send/automation (C8/C13) — Phase 1 stores and edits templates only. WABA template registration (C13).

## Decisions

*(Direction; finalized in `/comet-design`.)*

1. **Typed columns over key-value JSON:** a single `tenant_settings` row per tenant (1:1 with tenants) with typed columns and DB defaults — full Zod/Drizzle type safety, no stringly-typed parsing; adding a setting is a migration, which matches the repo's schema-first conventions. (Alternative EAV/JSONB rejected: loses typing, invites drift.)
2. **Identity fields stay on `tenants`** (brandName, brandLogoUrl, waNumber — they define the tenant, and Phase 4 signup writes them); the Settings UI edits both the tenant identity section and the settings row. Operational/integration keys live in `tenant_settings`.
3. **Message templates as their own table** (`message_templates`: key, label, body with `{variable}` placeholders, per-tenant) seeded with the PRD's Indonesian starter set (greeting, price quote, DP reminder, H-60, H-30, document checklist, testimonial ask); the editor is generic so C8 consumes without schema change.
4. **Multiple WA numbers:** primary on `tenants.waNumber`, additional numbers as a small list in settings (C13 multi-agent routing may formalize later).
5. **Hot-key reads** via request-scoped memo + 60s in-process TTL; settings writes are rare and the threshold tolerates a minute of staleness (status self-heals per departure-inventory design).

## Risks / Trade-offs

- [Settings row missing for a tenant] → creation hook when a tenant is created + lazy upsert-on-first-read; defaults in DB.
- [Template variables typo'd by users] → editor validates placeholders against each template key's allowed variable list (defined in shared).
- [Column-per-setting migrations feel heavy] → acceptable at this cadence; revisit only if settings churn becomes weekly.

## Migration Plan

Additive (`tenant_settings`, `message_templates` + seeds for the default tenant).

## Open Questions

- Exact default follow-up intervals per stage (business input; placeholder defaults from PRD cadence discussion, editable anyway).
```

## openspec/changes/tenant-settings/tasks.md

- Source: openspec/changes/tenant-settings/tasks.md
- Lines: 1-23
- SHA256: 79f6028b9b50ce1e10720be710c4be64d270e42829b83ffb9086654d3adccc6b

```md
# Tasks: tenant-settings

## 1. Contracts & schema

- [ ] 1.1 Shared: settings schema (typed keys, E.164 normalization accepting 08/62/+62, threshold/hold validation), template keys + allowed-variables map
- [ ] 1.2 DB: `tenant_settings` (1:1 tenants, DB defaults), `message_templates`; migration + Indonesian starter-template seed

## 2. API

- [ ] 2.1 Settings module (admin-only): read/update settings + tenant identity section; lazy upsert-on-first-read
- [ ] 2.2 Templates endpoints with placeholder validation
- [ ] 2.3 Hot-key read path (request memo + short TTL); wire departure-inventory threshold to it

## 3. Web UI

- [ ] 3.1 Settings screens: identity (brand/logo/WA), integrations (Pixel/Tag IDs), operations (threshold, hold expiry, follow-up intervals) — mobile-first, admin-only nav
- [ ] 3.2 Message-templates editor with placeholder hints and validation errors

## 4. Verification

- [ ] 4.1 Unit tests: E.164 normalization matrix, placeholder validation, defaults resolution
- [ ] 4.2 Integration tests: staff 403, settings round-trip, threshold consumption by status engine
- [ ] 4.3 `bun run verify` and `bun run test:int` pass
```

## openspec/changes/tenant-settings/specs/tenant-settings/spec.md

- Source: openspec/changes/tenant-settings/specs/tenant-settings/spec.md
- Lines: 1-46
- SHA256: 003e930e875b09837572ad8a6ce3c87c945616e56c1503aad7585f52cc15ea97

```md
# Delta Spec: tenant-settings

## ADDED Requirements

### Requirement: Typed per-tenant settings with defaults
The system SHALL store per-tenant settings — Meta Pixel ID, Google Tag ID, almost-full threshold (default 5), hold expiry hours (default 48), default follow-up intervals per stage, additional WA numbers — as typed, validated values with defaults such that a tenant with no explicit settings behaves correctly.

#### Scenario: Defaults apply
- **WHEN** a tenant has never edited settings and the status engine reads the almost-full threshold
- **THEN** the default value 5 is returned

#### Scenario: Validation enforced
- **WHEN** an admin saves a WA number not normalizable to E.164 or a non-positive threshold
- **THEN** the save is rejected with field-level errors

### Requirement: Tenant identity editing
The Settings UI SHALL edit tenant identity (brand name, brand logo, primary WA number accepting `08…`/`62…`/`+62…` input normalized to E.164) alongside operational settings.

#### Scenario: Brand update
- **WHEN** an admin updates the brand name and uploads a logo
- **THEN** subsequent reads (e.g. WhatsApp summary legality/branding contexts) reflect the new values

### Requirement: Message template library
The system SHALL store per-tenant message templates seeded with the Indonesian starter set (greeting, price quote, DP reminder, H-60 reminder, H-30 settlement reminder, document checklist request, testimonial ask), editable in a templates editor that validates `{variable}` placeholders against each template's allowed variables.

#### Scenario: Template edited with valid variables
- **WHEN** an admin edits the price-quote template using allowed placeholders
- **THEN** the template saves and is returned by the templates API

#### Scenario: Unknown placeholder rejected
- **WHEN** a template body contains a placeholder not in that template's allowed list
- **THEN** the save is rejected naming the invalid placeholder

### Requirement: Admin-only access
Settings (read and write, including templates) SHALL be admin-only; staff requests receive 403 and staff UI shows no Settings navigation.

#### Scenario: Staff blocked
- **WHEN** a staff user calls any settings endpoint
- **THEN** the response is 403 with the standard envelope

### Requirement: Threshold consumed by inventory
The almost-full threshold SHALL be read from tenant settings by the departure status engine; changing it affects subsequent status evaluations.

#### Scenario: Threshold change
- **WHEN** an admin changes the threshold from 5 to 10 and a mutation leaves a departure at 8 seats
- **THEN** the departure's status evaluates to `almost_full`
```

