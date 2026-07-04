import { DEFAULT_TENANT_SLUG } from "@cometkit/shared";

/**
 * Derive a tenant slug from a browser host. Mirrors the API's slugFromHost:
 * Apex, `www`, and `localhost` resolve to the default tenant; `{slug}.domain`
 * resolves to `{slug}`.
 */
export function tenantSlugFromHost(host: string | null): string {
  if (!host) return DEFAULT_TENANT_SLUG;
  const hostname = (host.split(":")[0] ?? host).toLowerCase();
  const labels = hostname.split(".");
  // localhost / apex (example.com) / single label -> default
  if (hostname === "localhost" || labels.length < 3) {
    // `{slug}.localhost` is a 2-label host we still want to split.
    if (labels.length === 2 && labels[1] === "localhost") {
      const first = labels[0] ?? DEFAULT_TENANT_SLUG;
      return first === "www" ? DEFAULT_TENANT_SLUG : first;
    }
    return DEFAULT_TENANT_SLUG;
  }
  const sub = labels[0] ?? DEFAULT_TENANT_SLUG;
  return sub === "www" ? DEFAULT_TENANT_SLUG : sub;
}
