# Tasks: provider-management

## 1. Contracts & schema

- [ ] 1.1 Shared: `COMMISSION_TYPES`, `ACCREDITATIONS` tuples; provider request schemas + admin/staff response DTOs
- [ ] 1.2 DB: `providers` table (tenant-owned, enums derive from shared), migration, seed demo provider

## 2. API

- [ ] 2.1 Providers module: controller/service/policy per feature pattern; tenant-scoped queries; role-aware mappers
- [ ] 2.2 Activate/deactivate endpoints with license + price-publication-consent validation; deactivation returns affected-packages list and unpublishes in one transaction (interface stub until package-catalog lands)
- [ ] 2.3 Storage seam: upload module (local-disk dev impl behind S3-compatible interface), tenant-prefixed keys; logo upload endpoint

## 3. Web UI

- [ ] 3.1 Provider list + detail + create/edit form (mobile-first), logo upload, activation flow with consent checkbox and deactivation impact dialog
- [ ] 3.2 Staff variant: provider views without commission fields

## 4. Verification

- [ ] 4.1 Unit tests: activation policy (license/consent matrix), commission-field stripping
- [ ] 4.2 Integration test: provider CRUD tenant-scoped; deactivation transaction
- [ ] 4.3 `bun run verify` and `bun run test:int` pass
