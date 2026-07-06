## Why

The Create/Edit Package form lists **every** provider in the "Licensed Provider"
dropdown, including inactive ones. Inactive providers cannot legally back a
published package (publish is already blocked on an inactive provider), so
offering them at selection time invites a dead-end choice and mis-assignment.
The dropdown should only offer providers that are eligible to be selected.

## What Changes

- The "Licensed Provider" dropdown in the package create/edit form SHALL only
  list **active** providers.
- **Edit exception**: when editing an existing package whose assigned provider
  has since been deactivated, that provider SHALL still appear in the dropdown
  (so the current selection is not silently lost), while all other inactive
  providers remain hidden.
- The default provider auto-selected for a **new** package SHALL be the first
  **active** provider (not merely the first provider returned).
- No API, schema, or provider-management changes. This is a client-side
  selection rule using the `isActive` flag already present on `ProviderDto`.

## Capabilities

### New Capabilities

<!-- none -->

### Modified Capabilities

- `package-catalog`: the package create/edit flow gains a requirement that the
  provider selection offers only active providers, with an exception preserving
  the already-assigned provider when editing.

## Impact

- **Web**: `apps/web/src/app/dashboard/packages/[id]/page.tsx` — the Licensed
  Provider `<select>` options and the new-package default-selection effect.
- **Data/API**: none. `ProviderDto.isActive` is already returned by the
  providers list endpoint and consumed by `useProviders`.
- **Risk**: minimal; purely additive filtering on an existing field.
