## ADDED Requirements

### Requirement: Public featured packages are reachable without authentication

The system SHALL expose a public, unauthenticated endpoint that returns a tenant's
published packages for the consumer landing page. The endpoint MUST resolve the tenant
from the request host (via the existing host-based tenant resolution) and MUST NOT
require a JWT, session cookie, or any role.

#### Scenario: Anonymous visitor loads featured packages
- **WHEN** a request with no authentication reaches the public featured-packages endpoint
- **THEN** the system resolves the tenant from the request host
- **AND** responds `200` with that tenant's published packages (no redirect, no 401)

#### Scenario: Anonymous landing page never redirects to login
- **WHEN** an anonymous visitor opens the landing page and it fetches featured packages
- **THEN** the response is a success (not `401`)
- **AND** the visitor is NOT redirected to `/login` and sees no "session expired" notice

### Requirement: Public endpoint returns only published, marketing-safe data

The endpoint SHALL return only packages whose status is `published`. Each item MUST
expose only marketing-safe fields (title, slug, hotels with city/stars/distance, airline
name, nearest departure date, starting price, seats available) and MUST NOT expose
internal fields such as commission, category internals, deposit/pricing internals, or
internal provider identifiers.

#### Scenario: Draft and archived packages are excluded
- **WHEN** the public endpoint is queried for a tenant that has draft or archived packages
- **THEN** only `published` packages appear in the response

#### Scenario: Internal fields are not leaked
- **WHEN** the public endpoint returns a package
- **THEN** the payload contains only marketing-safe fields
- **AND** contains no commission, category-internal, deposit/pricing-internal, or internal provider identifier fields

### Requirement: Featured-first ordering with recent-published fallback

The endpoint SHALL return featured packages first. When the tenant has fewer featured
packages than the requested limit, the system SHALL fill the remainder with the most
recent published packages so the landing section is never empty while published packages
exist.

#### Scenario: Featured packages exist
- **WHEN** the tenant has packages marked featured
- **THEN** featured packages appear first in the response

#### Scenario: No featured packages but published ones exist
- **WHEN** the tenant has published packages but none are marked featured
- **THEN** the response returns recent published packages (a non-empty list)

#### Scenario: No published packages
- **WHEN** the tenant has no published packages
- **THEN** the response is an empty list and the landing renders its empty state (still no redirect)
