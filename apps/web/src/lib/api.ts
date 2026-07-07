import ky from "ky";

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
