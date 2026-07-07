## ADDED Requirements

### Requirement: Session expiry redirects to login

When any API request from the web client returns HTTP `401` (unauthenticated), the app SHALL clear
the client session hint, drop the cached `me` query, and redirect the user to `/login`. The redirect
SHALL preserve the user's current path as a `returnUrl` query parameter so the user can be returned
after re-authenticating.

#### Scenario: Expired session redirects with return URL

- **WHEN** a user on `/dashboard/packages/123` makes a request that returns `401`
- **THEN** the user is redirected to `/login` with `returnUrl` set to `/dashboard/packages/123` and
  the client session state is cleared

#### Scenario: Return to original page after re-login

- **WHEN** a user who was redirected with a `returnUrl` successfully logs in again
- **THEN** the app navigates the user back to the `returnUrl` (falling back to the default dashboard
  when the `returnUrl` is absent or points at `/login`)

#### Scenario: Return URL cannot be an open redirect

- **WHEN** the `returnUrl` is an absolute or external URL (e.g. `http://evil.com`, `//evil.com`) or
  points at `/login`
- **THEN** the app ignores it and navigates to the default dashboard after login

### Requirement: Session-expired notice on login

After a redirect caused by session expiry, the login page SHALL display a notice informing the user
that their session expired and they need to sign in again.

#### Scenario: Notice shown on expiry redirect

- **WHEN** a user lands on `/login` as a result of a `401`-triggered redirect
- **THEN** a "your session expired" notice is displayed on the login page

### Requirement: Login endpoint and 403 are excluded from redirect

The session-expiry handler SHALL NOT redirect for `401` responses from the `auth/login` endpoint, and
SHALL NOT fire when the user is already on `/login`. `403` (forbidden) responses SHALL NOT trigger a
redirect and SHALL surface as an inline error where the action occurred.

#### Scenario: Bad-password login is not treated as expiry

- **WHEN** a user submits wrong credentials on `/login` and the `auth/login` request returns `401`
- **THEN** the normal invalid-credentials error is shown, no "session expired" notice appears, and no
  redirect loop occurs

#### Scenario: Forbidden stays in place

- **WHEN** a request returns `403` because the user lacks permission
- **THEN** the app shows an inline error at the point of the action and does NOT redirect to login
