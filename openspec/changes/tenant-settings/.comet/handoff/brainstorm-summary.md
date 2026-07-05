# Brainstorm Summary

- Change: tenant-settings
- Date: 2026-07-05

## Confirmed Technical Approach

- **Schema:**
  - `tenant_settings` table (1:1 with `tenants`) containing columns for Meta Pixel ID, Google Tag ID, almost-full threshold (default 5), hold expiry hours (default 48), and four pipeline stage follow-up intervals: `followUpLeadDays` (default 2), `followUpQuoteDays` (default 3), `followUpDpReminderDays` (default 7), `followUpFullPaymentDays` (default 14).
  - `tenant_wa_numbers` table (1:N with `tenants`) to support multiple WhatsApp numbers.
  - `message_templates` table (1:N with `tenants`) with unique `(tenantId, key)` constraint.
- **Message Templates:** Starter Indonesian templates (greeting, price_quote, dp_reminder, h60_reminder, h30_reminder, doc_checklist, testimonial_ask) seeded into database. Save operations validate that template body placeholders match the specific template key's allowed variables list.
- **API & Guards:** Settings endpoints are protected under admin role. Reading settings will lazily upsert the row with database defaults if it doesn't exist yet. Hot-key reads like the status threshold will be cached for 60 seconds.

## Key Trade-offs and Risks
- **Strict Column Schemas:** Requires database migrations for any new setting key, but ensures complete type-safety (Drizzle + Zod) and avoids untyped JSON drift.
- **Cache Invalidation:** Minor staleness (up to 60s) is acceptable for operational thresholds like `almostFullThreshold`.

## Testing Strategy
- **Unit tests:** Normalization of WA numbers, template placeholder validations, and default values.
- **Integration tests:** Scoped database integration testing settings CRUD, admin-only guard access, and threshold consumption by status engine.

## Spec Patches
- None.
