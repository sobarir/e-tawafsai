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
