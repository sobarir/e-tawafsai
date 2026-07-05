# Tasks: provider-management

## 1. Contracts & schema

- [x] 1.1 Shared: `COMMISSION_TYPES`, `ACCREDITATIONS` tuples; provider request schemas + admin/staff response DTOs
- [x] 1.2 DB: `providers` table (tenant-owned, enums derive from shared), migration, seed demo provider

## 2. API

- [x] 2.1 Providers module: controller/service/policy per feature pattern; tenant-scoped queries; role-aware mappers
- [x] 2.2 Activate/deactivate endpoints with license + price-publication-consent validation; deactivation returns affected-packages list and unpublishes in one transaction (interface stub until package-catalog lands)
- [x] 2.3 Storage seam: upload module (local-disk dev impl behind S3-compatible interface), tenant-prefixed keys; logo upload endpoint

## 3. Web UI

- [x] 3.1 Provider list + detail + create/edit form (mobile-first), logo upload, activation flow with consent checkbox and deactivation impact dialog
- [x] 3.2 Staff variant: provider views without commission fields

## 4. Verification

- [x] 4.1 Unit tests: activation policy (license/consent matrix), commission-field stripping
- [x] 4.2 Integration test: provider CRUD tenant-scoped; deactivation transaction
- [x] 4.3 `bun run verify` and `bun run test:int` pass
