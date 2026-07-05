# Comet Design Handoff

- Change: package-catalog
- Phase: design
- Mode: compact
- Context hash: 278fcaf21932c9f4c00578beb3df6cd17901537bf97ed5a15c717e337cda2dec

Generated-by: comet-handoff.sh

OpenSpec remains the canonical capability spec. This handoff is a deterministic, source-traceable context pack, not an agent-authored summary.

## openspec/changes/package-catalog/proposal.md

- Source: openspec/changes/package-catalog/proposal.md
- Lines: 1-31
- SHA256: 13322101f3d296222be2445a0f07d8c4b9e9477327a76e345c4cc616fe0132c0

```md
# Proposal: package-catalog

## Why

The catalog is the product's core: replacing dozens of flyer images scattered across WhatsApp with a searchable, structured source of truth. The agent must be able to enter a package from a flyer in under 5 minutes with the flyer image kept attached (PRD C3).

## What Changes

- Package CRUD (admin) per domain model: provider ref, `productType` enum seam (`umrah`|`haji_khusus`|`haji_furoda` — only `umrah` creatable until C18, per D6), title, per-tenant unique slug (auto-generated, editable), umrah `category` enum, `plusDestination`, `durationDays`, description, structured `hotelMakkah`/`hotelMadinah` (name, stars, distance-to-mosque meters / `pelataran` flag), `airline`, `flightRoute`, `departureCity`, `isFeatured`, `status` (draft/published/archived).
- Flyer-first create flow: multi-image upload (drag-drop + mobile camera capture) as step 1, rendered side-by-side with the entry form; originals always kept attached and viewable on the admin package page.
- Inclusions/exclusions as tag-style multi-selects seeded with common values (visa, tiket PP, hotel, makan 3x, bus AC, muthawif, perlengkapan umrah, asuransi, handling, airport tax, kereta cepat Haramain) plus free-text add.
- Publish workflow with validation: publish blocked unless duration, both hotels with distance, airline, departure city, category are present and the provider is active with the license required by the productType; drafts may be incomplete. Only published packages will ever be publicly visible (consumed by C6).
- Implements the provider-deactivation unpublish cascade consumer side (interface from provider-management).

## Capabilities

### New Capabilities

- `package-catalog`: package entity with flyer attachments, structured filterable fields, tag-based inclusions/exclusions, per-tenant slugs, and the draft→published→archived lifecycle with publish-time validation.

### Modified Capabilities

(none)

## Impact

- `packages/shared`: `PRODUCT_TYPES`, `PACKAGE_CATEGORIES`, `PACKAGE_STATUSES` tuples; package schemas/DTOs; seeded inclusion tags.
- `packages/db`: `packages` table (tenant-owned; hotel fields; enums), migration.
- `apps/api`: packages module; flyer upload via the storage seam from provider-management.
- `apps/web`: package list + flyer-first create/edit flow (side-by-side layout, mobile camera capture).
- Depends on: `multi-tenancy-foundation`, `auth-rbac`, `provider-management`. Consumed by: `departure-inventory`, `package-search`, Phase 2 C6/C19.
```

## openspec/changes/package-catalog/design.md

- Source: openspec/changes/package-catalog/design.md
- Lines: 1-42
- SHA256: eb48d68a073b0ba40d143ca6f5696574cb3baa92888785ae885f2b260bb16e2c

```md
# Design: package-catalog

## Context

Builds on providers (FK + active-license validation) and the storage seam. The schema must carry the D6 seams now (`productType`) even though only umrah is creatable, so C18 is an enum unlock rather than a migration. Departures are a separate change (C4) — a package here can exist without departures, but publish-readiness interacts with them (PRD invariant: published packages need ≥1 open departure or a waiting-list state; the enforcement point is decided below).

## Goals / Non-Goals

**Goals:**
- Flyer-first, under-5-minute entry flow usable on a phone.
- Structured fields for everything that drives filtering (C5) — no free-text where a filter needs numbers/enums.
- Publish-time validation distinct from draft-time laxity.
- Slug/uniqueness per tenant; flyers under tenant-prefixed storage.

**Non-Goals:**
- Departure/price/seat data (C4). Public rendering & SEO (C6). AI extraction (C19) — but the create flow's form model should not preclude prefilled candidates later.
- Haji-specific validation and fields (C18) beyond the enum seam.

## Decisions

*(Direction; finalized in `/comet-design`.)*

1. **Hotels as embedded columns, not a hotels table:** `hotel_makkah_name/stars/distance_m/is_pelataran` + Madinah equivalents. Flyers name hotels inconsistently; normalization would slow entry for zero Phase-1 benefit. Revisit if hotel reuse emerges.
2. **Publish validation lives in a pure `packages.policy.ts` function** returning field-level errors (repo pattern: decisions in policies, HTTP exceptions in services) — reused verbatim by C18's type-aware rules and C19's AI-prefilled saves.
3. **"≥1 open departure to publish" is NOT enforced in this change** (departures don't exist yet): publish validates content completeness + provider status; the departure-linked invariant and auto-flag-for-review land in departure-inventory. Sequencing note recorded in both changes.
4. **Flyer images:** multi-upload to storage seam; keep originals unmodified; derived web-optimized renditions deferred to C6 (public site) where they matter.
5. **Inclusion tags:** per-tenant tag table seeded with the common values, packages reference by join table — free-text adds become tenant tags, keeping the multi-select self-consistent. (Alternative array-of-text considered; join table wins for stable filter facets.)
6. **Slug generation:** kebab-case from title with per-tenant unique index and collision suffix; editable until published, then immutable (future public URLs/SEO).

## Risks / Trade-offs

- [Form is large; mobile entry could exceed 5 minutes] → single scrolling form with flyer pinned side-by-side/top-sticky on 380px; tag multi-selects with seeded defaults; measure with a stopwatch test during verify.
- [productType seam invites accidental haji creation] → creation validation hard-rejects non-`umrah` until C18 flag.
- [Slug immutability regret] → immutable only after first publish; admins can archive + recreate in Phase 1 if truly needed.

## Migration Plan

Additive (`packages`, `package_flyers`, `tags`, `package_tags`). Seed inclusion tag values for the default tenant.

## Open Questions

- Whether `pelataran` (courtyard-distance) needs a Madinah equivalent or only Makkah (flyer survey during design).
```

## openspec/changes/package-catalog/tasks.md

- Source: openspec/changes/package-catalog/tasks.md
- Lines: 1-25
- SHA256: 620329c4440a5723e62dccd8f3c288103071164101658cfc5179d838e6ca4446

```md
# Tasks: package-catalog

## 1. Contracts & schema

- [ ] 1.1 Shared: `PRODUCT_TYPES`, `PACKAGE_CATEGORIES`, `PACKAGE_STATUSES` tuples; package request/response schemas; seeded inclusion tag list
- [ ] 1.2 DB: `packages`, `package_flyers`, `tags`, `package_tags` tables (tenant-owned; per-tenant unique slug index); migration + tag seeding

## 2. API

- [ ] 2.1 Packages module per feature pattern; tenant-scoped CRUD; productType hard-locked to `umrah`
- [ ] 2.2 Slug service (generate, collision suffix, immutable-after-publish)
- [ ] 2.3 Publish/unpublish endpoints with `packages.policy.ts` completeness + provider-license validation
- [ ] 2.4 Flyer upload endpoints via storage seam (multi-image); provider-deactivation cascade consumer (unpublish transaction)

## 3. Web UI

- [ ] 3.1 Catalog list with status filter; package admin page with flyer gallery
- [ ] 3.2 Flyer-first create/edit flow: upload step, side-by-side flyer + form (sticky on 380px), tag multi-selects with free-text add, camera capture on mobile
- [ ] 3.3 Publish action surfacing field-level errors inline

## 4. Verification

- [ ] 4.1 Unit tests: publish policy matrix, slug generation/collision/immutability
- [ ] 4.2 Integration tests: CRUD tenant-scoped; cascade unpublish with provider-management; flyer persistence
- [ ] 4.3 `bun run verify` and `bun run test:int` pass
```

## openspec/changes/package-catalog/specs/package-catalog/spec.md

- Source: openspec/changes/package-catalog/specs/package-catalog/spec.md
- Lines: 1-57
- SHA256: 1662c2a927e06c4fa2c69ace344ff4d19aa2a7539a4647b23aed9d8b8c281e2b

```md
# Delta Spec: package-catalog

## ADDED Requirements

### Requirement: Package entity with structured fields
The system SHALL provide tenant-scoped CRUD for Packages with: provider ref, `productType` (`umrah`|`haji_khusus`|`haji_furoda`), `title`, per-tenant unique `slug`, `category` (`regular`|`plus`|`private_vip`|`ramadan`|`arbain`|`other`), `plusDestination` (nullable), `durationDays`, `description`, inclusions/exclusions tags, flyer images, structured hotel fields stored in a one-to-many list by city (`cityName`, `name`, `stars`, `distanceM` (nullable), `isPelataran` (boolean)), `airline`, `flightRoute`, `departureCity`, `isFeatured`, `status` (`draft`|`published`|`archived`). Duration, category, airline, departure city, and hotel fields SHALL be structured (not free text).

#### Scenario: Create draft package
- **WHEN** an admin creates a package with title and provider only
- **THEN** it is saved as `draft` and listed in the admin catalog

#### Scenario: Only umrah creatable in Phase 1
- **WHEN** a package create/update specifies `productType` other than `umrah`
- **THEN** the request is rejected (enum seam exists; unlock ships with C18)

### Requirement: Flyer-first entry flow
The create flow SHALL start with flyer image upload step (multi-image, drag-drop, mobile camera capture) rendered side-by-side with the entry form; flyer upload is optional and can be skipped. Original flyers SHALL remain attached to the package and viewable in the admin package page. Flyers are stored under tenant-prefixed paths.

#### Scenario: Flyer attached and viewable
- **WHEN** the agent uploads a flyer and completes the form
- **THEN** the package exists with the flyer viewable on its admin page

#### Scenario: Upload failure degrades gracefully
- **WHEN** flyer upload fails
- **THEN** the form remains usable and the package can be saved as draft without images

### Requirement: Inclusions and exclusions as seeded tag multi-selects
Inclusions/exclusions SHALL be tag-style multi-selects seeded per tenant with common values (visa, tiket PP, hotel, makan 3x, bus AC, muthawif, perlengkapan umrah, asuransi, handling, airport tax, kereta cepat Haramain) and SHALL allow free-text additions that become tenant tags.

#### Scenario: Free-text tag added
- **WHEN** the agent types a new inclusion not in the seeded list
- **THEN** it is saved as a tenant tag and offered in future selections

### Requirement: Slug generation and immutability
Slugs SHALL be auto-generated from the title (kebab-case), editable while never-published, unique per tenant (collision gets a suffix), and immutable after first publish.

#### Scenario: Slug collision within tenant
- **WHEN** two packages in one tenant would produce the same slug
- **THEN** the second receives a deterministic suffix and both persist

### Requirement: Publish validation
Publishing SHALL be blocked with field-level errors unless: `durationDays`, at least one Makkah hotel, `airline`, `departureCity`, and `category` are present, and the package's Provider is active with the license required by the `productType` (umrah → `ppiuLicenseNo`). Drafts MAY be incomplete. Only `published` packages are ever exposed publicly (consumed by later changes). Transit hotels and flyer uploads are optional.

#### Scenario: Publish blocked on missing Makkah hotel
- **WHEN** the agent publishes a package missing a Makkah hotel
- **THEN** publish is rejected with a field-level error naming the missing field

#### Scenario: Publish blocked on inactive provider
- **WHEN** the agent publishes a package whose provider is inactive
- **THEN** publish is rejected with an explanatory error

### Requirement: Provider deactivation unpublishes packages
When a Provider is deactivated (per provider-management's cascade), its published Packages SHALL transition to `draft` (unpublished) in the same transaction.

#### Scenario: Cascade unpublish
- **WHEN** a provider with 3 published packages is deactivated with confirmation
- **THEN** all 3 packages become unpublished atomically
```

