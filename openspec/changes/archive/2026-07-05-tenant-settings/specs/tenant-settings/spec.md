# Delta Spec: tenant-settings

## ADDED Requirements

### Requirement: Typed per-tenant settings with defaults
The system SHALL store per-tenant settings — Meta Pixel ID, Google Tag ID, almost-full threshold (default 5), hold expiry hours (default 48), default follow-up intervals per stage, additional WA numbers — as typed, validated values with defaults such that a tenant with no explicit settings behaves correctly.

#### Scenario: Defaults apply
- **WHEN** a tenant has never edited settings and the status engine reads the almost-full threshold
- **THEN** the default value 5 is returned

#### Scenario: Validation enforced
- **WHEN** an admin saves a WA number not normalizable to E.164 or a non-positive threshold
- **THEN** the save is rejected with field-level errors

### Requirement: Tenant identity editing
The Settings UI SHALL edit tenant identity (brand name, brand logo, primary WA number accepting `08…`/`62…`/`+62…` input normalized to E.164) alongside operational settings.

#### Scenario: Brand update
- **WHEN** an admin updates the brand name and uploads a logo
- **THEN** subsequent reads (e.g. WhatsApp summary legality/branding contexts) reflect the new values

### Requirement: Message template library
The system SHALL store per-tenant message templates seeded with the Indonesian starter set (greeting, price quote, DP reminder, H-60 reminder, H-30 settlement reminder, document checklist request, testimonial ask), editable in a templates editor that validates `{variable}` placeholders against each template's allowed variables.

#### Scenario: Template edited with valid variables
- **WHEN** an admin edits the price-quote template using allowed placeholders
- **THEN** the template saves and is returned by the templates API

#### Scenario: Unknown placeholder rejected
- **WHEN** a template body contains a placeholder not in that template's allowed list
- **THEN** the save is rejected naming the invalid placeholder

### Requirement: Admin-only access
Settings (read and write, including templates) SHALL be admin-only; staff requests receive 403 and staff UI shows no Settings navigation.

#### Scenario: Staff blocked
- **WHEN** a staff user calls any settings endpoint
- **THEN** the response is 403 with the standard envelope

### Requirement: Threshold consumed by inventory
The almost-full threshold SHALL be read from tenant settings by the departure status engine; changing it affects subsequent status evaluations.

#### Scenario: Threshold change
- **WHEN** an admin changes the threshold from 5 to 10 and a mutation leaves a departure at 8 seats
- **THEN** the departure's status evaluates to `almost_full`
