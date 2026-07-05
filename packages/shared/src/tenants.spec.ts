import { describe, expect, it } from "vitest";
import {
  tenantInputSchema,
  tenantStorageKey,
  TENANT_TYPES,
  DEFAULT_TENANT_SLUG,
} from "./tenants";

const base = {
  name: "Tawafsai", slug: "default", tenantType: "agent" as const,
  plan: "subscription" as const, planStatus: "active" as const, brandName: "Tawafsai",
};

describe("tenantInputSchema", () => {
  it("accepts an agent + subscription tenant", () => {
    expect(tenantInputSchema.parse(base).slug).toBe("default");
  });
  it("rejects the ppiu seam value", () => {
    expect(tenantInputSchema.safeParse({ ...base, tenantType: "ppiu" }).success).toBe(false);
  });
  it("rejects the revenue_share seam value", () => {
    expect(tenantInputSchema.safeParse({ ...base, plan: "revenue_share" }).success).toBe(false);
  });
  it("rejects a non-kebab slug", () => {
    expect(tenantInputSchema.safeParse({ ...base, slug: "Not Kebab" }).success).toBe(false);
  });
  it("keeps the seam values defined in the tuple", () => {
    expect(TENANT_TYPES).toContain("ppiu");
    expect(DEFAULT_TENANT_SLUG).toBe("default");
  });
});

describe("tenantStorageKey", () => {
  it("prefixes the storage key with the tenant id", () => {
    const key = tenantStorageKey("01HTENANT", "packages/brochure.pdf");
    expect(key).toBe("01HTENANT/packages/brochure.pdf");
    expect(key.startsWith("01HTENANT/")).toBe(true);
  });
  it("normalizes a leading slash so the path cannot escape the prefix", () => {
    expect(tenantStorageKey("t1", "/avatars/a.png")).toBe("t1/avatars/a.png");
  });
  it("throws when the tenant id is missing", () => {
    expect(() => tenantStorageKey("", "a.png")).toThrow();
  });
});
