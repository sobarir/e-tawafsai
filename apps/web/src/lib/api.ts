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
  if (error && typeof error === "object" && "response" in error) {
    try {
      const body = (await (
        error as { response: Response }
      ).response.json()) as ApiError;
      if (body.errors) {
        return Object.values(body.errors).flat().join(" ");
      }
      if (body.message) return body.message;
    } catch {
      // fall through to generic message
    }
  }
  return "Something went wrong. Check that the API is running and try again.";
}
