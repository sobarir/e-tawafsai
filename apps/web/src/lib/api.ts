import ky, { HTTPError } from "ky";
import { clearSessionHint } from "@/lib/auth-storage";
import { shouldRedirectOnUnauthorized, buildLoginRedirect } from "@/lib/session-redirect";

/**
 * API client - single ky instance for the NestJS API.
 * Uses httpOnly cookie session context via credentials: "include".
 */
export const api = ky.create({
  prefix: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001",
  credentials: "include",
  hooks: {
    beforeRequest: [
      ({ request }) => {
        if (typeof window !== "undefined") {
          request.headers.set("X-Forwarded-Host", window.location.host);
        }
      },
    ],
    beforeError: [
      (state) => {
        // Global session-expiry handling: a 401 means the session is gone, so
        // clear the client hint and hard-navigate to /login with a return URL.
        // The full reload wipes the QueryClient cache, so no React context is
        // needed here. Excludes the login endpoint and the /login route; 403 is
        // left untouched (see shouldRedirectOnUnauthorized).
        if (typeof window !== "undefined" && state.error instanceof HTTPError) {
          const status = state.error.response?.status ?? 0;
          const requestUrl = state.request?.url ?? "";
          const currentPath = window.location.pathname;
          if (shouldRedirectOnUnauthorized({ status, requestUrl, currentPath })) {
            clearSessionHint();
            window.location.assign(buildLoginRedirect(currentPath + window.location.search));
          }
        }
        return state.error;
      },
    ],
  },
});

export interface ApiError {
  message: string;
  errors?: Record<string, string[]>;
  statusCode?: number;
}

export async function readApiError(error: unknown): Promise<string> {
  if (error && typeof error === "object") {
    const err = error as { data?: unknown; response?: Response };
    // ky v2 pre-parses the JSON error body into `error.data` and consumes the
    // response stream, so `error.response.json()` throws. Read `data` first.
    let body = err.data as ApiError | undefined;
    if ((!body || typeof body !== "object") && err.response) {
      try {
        body = (await err.response.json()) as ApiError;
      } catch {
        // fall through to generic message
      }
    }
    if (body && typeof body === "object") {
      if (body.errors) {
        return Object.values(body.errors).flat().join(" ");
      }
      if (body.message) return body.message;
    }
  }
  return "Something went wrong. Check that the API is running and try again.";
}
