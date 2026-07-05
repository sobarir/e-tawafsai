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
