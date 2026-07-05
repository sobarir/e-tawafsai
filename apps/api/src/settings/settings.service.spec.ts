import { describe, expect, it, vi } from "vitest";
import { SettingsService } from "./settings.service";
import type { Database } from "@cometkit/db";

describe("SettingsService", () => {
  it("retrieves settings and applies defaults if missing", async () => {
    const mockDb = {
      query: {
        tenantSettings: {
          findFirst: vi.fn().mockResolvedValue(null), // simulate not found
        },
        tenants: {
          findFirst: vi.fn().mockResolvedValue({
            brandName: "My Company",
            brandLogoUrl: null,
            waNumber: "628123456",
          }),
        },
        tenantWaNumbers: {
          findMany: vi.fn().mockResolvedValue([]),
        },
      },
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockResolvedValue([{}]),
      }),
    };

    const service = new SettingsService(mockDb as unknown as Database);
    const settings = await service.getSettings("tenant-1");

    expect(settings.brandName).toBe("My Company");
    expect(settings.almostFullThreshold).toBe(5); // default value
    expect(mockDb.insert).toHaveBeenCalled();
  });
});
