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
