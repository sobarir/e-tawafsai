import { describe, expect, it, vi } from "vitest";
import { SettingsController } from "./settings.controller";
import type { SettingsService } from "./settings.service";
import type { SettingsInput, AuthUser } from "@cometkit/shared";

describe("SettingsController", () => {
  it("delegates get to settings service", async () => {
    const serviceMock = {
      getSettings: vi.fn().mockResolvedValue({ almostFullThreshold: 5 }),
      updateSettings: vi.fn(),
    };

    const controller = new SettingsController(serviceMock as unknown as SettingsService);
    const mockUser = { id: "user-1", tenantId: "tenant-1" } as unknown as AuthUser;
    const result = await controller.get(mockUser);

    expect(result.almostFullThreshold).toBe(5);
    expect(serviceMock.getSettings).toHaveBeenCalledWith("tenant-1");
  });

  it("delegates patch to settings service", async () => {
    const serviceMock = {
      getSettings: vi.fn(),
      updateSettings: vi.fn().mockResolvedValue({ almostFullThreshold: 10 }),
    };

    const controller = new SettingsController(serviceMock as unknown as SettingsService);
    const mockUser = { id: "user-1", tenantId: "tenant-1" } as unknown as AuthUser;
    const input: SettingsInput = {
      metaPixelId: null,
      googleTagId: null,
      almostFullThreshold: 10,
      holdExpiryHours: 48,
      followUpLeadDays: 2,
      followUpQuoteDays: 3,
      followUpDpReminderDays: 7,
      followUpFullPaymentDays: 14,
      brandName: "My Company",
      brandLogoUrl: null,
      waNumber: "628123456",
      additionalWaNumbers: [],
    };
    const result = await controller.update(mockUser, input);

    expect(result.almostFullThreshold).toBe(10);
    expect(serviceMock.updateSettings).toHaveBeenCalledWith("tenant-1", input);
  });
});
