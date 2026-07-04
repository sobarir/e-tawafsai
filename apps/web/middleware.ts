import { NextResponse, type NextRequest } from "next/server";
import { tenantSlugFromHost } from "./src/lib/tenant";

/**
 * Subdomain-aware tenant seam. Phase 1 admin runs on the apex/default host, so
 * this does not change behavior; it exposes the resolved slug for the future
 * public site and keeps host forwarding consistent.
 */
export function middleware(req: NextRequest) {
  const slug = tenantSlugFromHost(req.headers.get("host"));
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-tenant-slug", slug);
  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
