import { describe, expect, it } from "vitest";
import { settingsInputSchema, templateInputSchema } from "./settings";

describe("settingsInputSchema", () => {
  it("accepts valid settings", () => {
    const valid = {
      metaPixelId: "123456",
      googleTagId: "G-123456",
      almostFullThreshold: 5,
      holdExpiryHours: 48,
      followUpLeadDays: 2,
      followUpQuoteDays: 3,
      followUpDpReminderDays: 7,
      followUpFullPaymentDays: 14,
      brandName: "My Agent",
      brandLogoUrl: "https://example.com/logo.png",
      waNumber: "62812345678",
      additionalWaNumbers: [
        { waNumber: "62812345679", label: "CS 2" }
      ],
    };
    expect(settingsInputSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects negative threshold", () => {
    const invalid = {
      brandName: "My Agent",
      almostFullThreshold: -1,
    };
    expect(settingsInputSchema.safeParse(invalid).success).toBe(false);
  });
});

describe("templateInputSchema", () => {
  it("accepts valid placeholders for greeting", () => {
    const valid = {
      key: "greeting",
      label: "Greeting",
      body: "Halo {customerName}, saya {agentName}",
    };
    expect(templateInputSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects invalid placeholders for greeting", () => {
    const invalid = {
      key: "greeting",
      label: "Greeting",
      body: "Halo {customerName}, saya {agentName} {unknownVar}",
    };
    expect(templateInputSchema.safeParse(invalid).success).toBe(false);
  });
});
