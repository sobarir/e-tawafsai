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
