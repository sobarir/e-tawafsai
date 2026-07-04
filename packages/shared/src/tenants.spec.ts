import { describe, expect, it } from "vitest";
import { tenantInputSchema, TENANT_TYPES, DEFAULT_TENANT_SLUG } from "./tenants";

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
