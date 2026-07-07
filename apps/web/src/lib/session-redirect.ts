/**
 * Pure decision helpers for global 401 session-expiry handling.
 *
 * These have no DOM/router access so they can be unit-tested in isolation; the
 * ky `beforeError` hook in `api.ts` wires them to `window.location`.
 */

/**
 * Decide whether an errored response should trigger a redirect to /login.
 * Only genuine session-expiry (401) redirects — and never for the login
 * endpoint itself, nor when the user is already on /login. 403 (forbidden)
 * is not a session problem and is left in place.
 */
export function shouldRedirectOnUnauthorized(input: {
  status: number;
  requestUrl: string;
  currentPath: string;
}): boolean {
  const { status, requestUrl, currentPath } = input;
  if (status !== 401) return false;
  if (requestUrl.includes("auth/login")) return false;
  if (currentPath === "/login") return false;
  return true;
}

const DEFAULT_PATH = "/dashboard";

/**
 * Constrain a returnUrl to a safe same-origin path to avoid open redirects.
 * Accepts only a path with a single leading slash; rejects protocol-relative
 * (`//host`), absolute (`http(s)://…`), the login route itself, and empty.
 */
export function safeReturnUrl(raw: string | null | undefined): string {
  if (!raw) return DEFAULT_PATH;
  if (!raw.startsWith("/")) return DEFAULT_PATH;
  if (raw.startsWith("//")) return DEFAULT_PATH;
  if (raw === "/login" || raw.startsWith("/login?") || raw.startsWith("/login/")) {
    return DEFAULT_PATH;
  }
  return raw;
}

/** Build the /login redirect target that preserves the current path + marks expiry. */
export function buildLoginRedirect(currentPathWithSearch: string): string {
  return `/login?returnUrl=${encodeURIComponent(currentPathWithSearch)}&expired=1`;
}
