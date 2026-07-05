# Delta Spec: authentication

## ADDED Requirements

### Requirement: Email+password authentication with tenant-bound sessions
The system SHALL authenticate users by email+password, issue a session token bound to the user's tenant, and hash passwords only via the single common hashing module. The session token SHALL be delivered as an httpOnly cookie so it is not readable by client JavaScript; a logout endpoint SHALL clear that cookie.

#### Scenario: Successful login
- **WHEN** a user submits valid credentials
- **THEN** a token is issued carrying the user's id, role, and tenant association, set as an httpOnly session cookie

#### Scenario: Invalid credentials
- **WHEN** a user submits an unknown email or wrong password
- **THEN** the response is 401 with the standard error envelope and no token

#### Scenario: Logout clears the session
- **WHEN** a signed-in user logs out
- **THEN** the session cookie is cleared and subsequent requests without a valid session receive 401

### Requirement: Authenticated access to admin area
All admin/dashboard routes (web) and all non-public API routes SHALL be inaccessible without authentication; unauthenticated web access redirects to login.

#### Scenario: Unauthenticated admin route access
- **WHEN** an unauthenticated request targets any admin/dashboard route
- **THEN** the web user is redirected to login and API requests receive 401

### Requirement: Fresh role and account status per request
Authorization SHALL read the user's role, active status, and tenant fresh from the database on every request, so role changes and deactivation apply to existing tokens immediately.

#### Scenario: Deactivated user with valid token
- **WHEN** a user is deactivated and then uses a previously issued valid token
- **THEN** the request is rejected with 401/403

#### Scenario: Role downgrade applies immediately
- **WHEN** an admin is changed to staff and reuses an existing token on an admin-only route
- **THEN** the request is rejected with 403

### Requirement: No public self-registration in Phase 1
The system SHALL NOT offer public self-registration of accounts; users are created by a tenant admin (or seed). Tenant signup is deferred to the SaaS phase. The `/register` web route MAY remain as a non-functional placeholder (access-request / coming-soon surface) that does not create accounts.

#### Scenario: Account creation disabled
- **WHEN** an unauthenticated request attempts to create a new account via registration
- **THEN** the request is rejected and no user is created

#### Scenario: Register page is an inert placeholder
- **WHEN** an unauthenticated visitor opens the `/register` page
- **THEN** the page renders as an access-request placeholder and offers no working account-creation form
