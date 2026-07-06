## Context

The package create/edit form (`apps/web/src/app/dashboard/packages/[id]/page.tsx`)
renders the "Licensed Provider" `<select>` by mapping `providersList.data`
directly (line ~384), with no filter on `isActive`. It also auto-selects the
first provider for new packages via an effect (`providersList.data[0]`, line
~102). `ProviderDto.isActive` is already returned by the providers list endpoint
(`apps/api/src/providers`) and typed in `@cometkit/shared`, so no backend work is
required.

## Goals / Non-Goals

**Goals:**
- Show only active providers in the Licensed Provider dropdown.
- When editing, keep the currently-assigned provider visible even if it is now
  inactive, so the selection is not lost on save.
- Default a new package to the first *active* provider.

**Non-Goals:**
- No change to provider CRUD, activation flow, or the publish-time active-provider
  validation (already enforced server-side).
- No API, DTO, or database changes.
- No change to the packages list page or other provider dropdowns.

## Decisions

- **Client-side filter, single source.** Derive the visible options as:
  `providers.filter(p => p.isActive || p.id === providerId)`. Including the
  current `providerId` transparently satisfies the edit-time exception without a
  separate branch, and is a no-op for new packages (where `providerId` is a
  selected active id).
- **Default-selection effect** picks the first provider where `isActive` is true,
  instead of `data[0]`. If none are active, leave the selection blank (the form
  simply has no valid provider to offer — consistent with the "no active
  providers" scenario).
- **Render from the derived list**, so both the options and the default effect
  read the same filtered set.

## Risks / Trade-offs

- If a package's assigned provider is inactive, admins can still re-save that
  package with that provider. This is intentional (preserve the assignment);
  publishing such a package remains blocked server-side by the existing
  active-provider publish rule.
- Client-side filtering trusts `isActive` from the list response; the list
  endpoint already returns all providers with the flag, so the filter is exact.
