# Tasks: tenant-settings

## 1. Contracts & schema

- [x] 1.1 Shared: settings schema (typed keys, E.164 normalization accepting 08/62/+62, threshold/hold validation), template keys + allowed-variables map
- [x] 1.2 DB: `tenant_settings` (1:1 tenants, DB defaults), `message_templates`; migration + Indonesian starter-template seed

## 2. API

- [x] 2.1 Settings module (admin-only): read/update settings + tenant identity section; lazy upsert-on-first-read
- [x] 2.2 Templates endpoints with placeholder validation
- [x] 2.3 Hot-key read path (request memo + short TTL); wire departure-inventory threshold to it

## 3. Web UI

- [x] 3.1 Settings screens: identity (brand/logo/WA), integrations (Pixel/Tag IDs), operations (threshold, hold expiry, follow-up intervals) — mobile-first, admin-only nav
- [x] 3.2 Message-templates editor with placeholder hints and validation errors

## 4. Verification

- [x] 4.1 Unit tests: E.164 normalization matrix, placeholder validation, defaults resolution
- [x] 4.2 Integration tests: staff 403, settings round-trip, threshold consumption by status engine
- [x] 4.3 `bun run verify` and `bun run test:int` pass

