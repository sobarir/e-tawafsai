## ADDED Requirements

### Requirement: Reusable confirmation dialog primitive

The web app SHALL provide a single reusable, accessible confirmation dialog primitive (built on
shadcn `AlertDialog` / `@radix-ui/react-alert-dialog`) that all destructive actions use. The dialog
SHALL accept a title, a description or rich content slot for action-specific details, a configurable
confirm-button label styled as destructive, and cancel/confirm handlers.

#### Scenario: Dialog is accessible

- **WHEN** the confirmation dialog opens
- **THEN** focus is trapped within the dialog, `Escape` cancels it, and it exposes an alert-dialog
  ARIA role with the title and description associated for assistive technology

#### Scenario: Cancel performs no action

- **WHEN** a user opens the confirmation dialog and chooses Cancel (or presses `Escape`, or clicks
  outside)
- **THEN** the dialog closes and the underlying destructive action does NOT run

### Requirement: All destructive actions are confirmed

The web app SHALL gate every irreversible action with the reusable confirmation dialog: deletes
(airlines, departure cities, provider categories, package departure schedules), provider
deactivation, user deactivation, and package unpublish. Except for provider deactivation, no
destructive action SHALL execute directly on click without an intervening confirmation, and native
`window.confirm` and the bespoke provider-deactivate modal SHALL be removed in favor of the shared
dialog. Provider deactivation is an exception: because the affected-packages impact list is produced
by the deactivation call itself, the action executes on click and the shared dialog presents the
impact for acknowledgement (see its scenario).

#### Scenario: Delete requires confirmation

- **WHEN** an admin clicks Delete on a destructive item (e.g. an airline in master data)
- **THEN** the confirmation dialog appears identifying the item, and the item is deleted only after
  the user confirms

#### Scenario: Deactivate uses the shared dialog with impact details

- **WHEN** an admin clicks Deactivate on an active provider
- **THEN** the provider is deactivated and its published packages are unpublished in one atomic
  transaction, and the shared dialog appears rendering the affected-packages impact list in its
  content slot for the admin to acknowledge

#### Scenario: No native confirm remains

- **WHEN** a user triggers the package departure-schedule delete
- **THEN** the shared confirmation dialog is shown instead of a native browser `window.confirm`
  prompt
