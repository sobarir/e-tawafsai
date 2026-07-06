## ADDED Requirements

### Requirement: Active-only provider selection in package form

The package create/edit form SHALL offer only **active** providers in the
"Licensed Provider" selection. When editing an existing package whose assigned
provider is inactive, that provider SHALL remain selectable so the current
assignment is preserved; all other inactive providers SHALL be excluded. For a
new package, the default-selected provider SHALL be the first active provider.

#### Scenario: New package lists only active providers
- **WHEN** an admin opens the create package form and there are both active and inactive providers
- **THEN** the Licensed Provider dropdown lists only the active providers
- **AND** the pre-selected provider is the first active provider

#### Scenario: Editing preserves an inactive assigned provider
- **WHEN** an admin edits a package whose assigned provider has since been deactivated
- **THEN** the Licensed Provider dropdown still includes that assigned provider (shown selected)
- **AND** no other inactive provider appears in the dropdown

#### Scenario: No active providers available
- **WHEN** an admin opens the create package form and every provider is inactive
- **THEN** the Licensed Provider dropdown offers no provider options
- **AND** no inactive provider is auto-selected
