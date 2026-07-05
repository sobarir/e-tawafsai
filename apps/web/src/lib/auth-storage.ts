// The real session token lives in an httpOnly cookie set by the API and is NOT
// readable here. This is only a non-sensitive client hint so the UI knows a
// session likely exists (gates the /auth/me query). Server middleware reads the
// httpOnly token cookie directly.
const HINT = "cometkit.authed";

export function hasSession(): boolean {
  if (typeof document === "undefined") return false;
  return document.cookie.split("; ").some((c) => c === `${HINT}=1`);
}

export function setSessionHint(): void {
  document.cookie = `${HINT}=1; path=/; SameSite=Lax`;
}

export function clearSessionHint(): void {
  document.cookie = `${HINT}=; path=/; Max-Age=0; SameSite=Lax`;
}
