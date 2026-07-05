import { describe, expect, it } from "vitest";
import { createProviderSchema, activateProviderSchema } from "./providers";

describe("Provider schemas", () => {
  it("validates a correct provider payload", () => {
    const payload = {
      name: "PT. Al-Amin",
      brandName: "Al-Amin",
      contactPerson: "Budi",
      contactPhone: "62812345678",
      accreditation: "A",
      defaultCommissionType: "flat_per_pax",
      defaultCommissionValue: 500000,
    };

    const parsed = createProviderSchema.parse(payload);
    expect(parsed.name).toBe("PT. Al-Amin");
    expect(parsed.allowLogoOnPublicPages).toBe(false); // default
  });

  it("requires consent for activation", () => {
    const payload = {
      ppiuLicenseNo: "PPIU-123",
      consentConfirmed: false,
    };

    const result = activateProviderSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });
});
