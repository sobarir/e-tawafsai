import { describe, expect, it, vi } from "vitest";
import { TemplatesController } from "./templates.controller";
import type { SettingsService } from "./settings.service";
import type { TemplateInput, AuthUser } from "@cometkit/shared";

describe("TemplatesController", () => {
  it("delegates list to settings service", async () => {
    const serviceMock = {
      getTemplates: vi.fn().mockResolvedValue([{ key: "greeting", body: "Halo" }]),
      updateTemplate: vi.fn(),
    };

    const controller = new TemplatesController(serviceMock as unknown as SettingsService);
    const mockUser = { id: "user-1", tenantId: "tenant-1" } as unknown as AuthUser;
    const result = await controller.list(mockUser);

    expect(result[0]?.key).toBe("greeting");
    expect(serviceMock.getTemplates).toHaveBeenCalledWith("tenant-1");
  });

  it("delegates update to settings service", async () => {
    const serviceMock = {
      getTemplates: vi.fn(),
      updateTemplate: vi.fn().mockResolvedValue({ key: "greeting", body: "Halo2" }),
    };

    const controller = new TemplatesController(serviceMock as unknown as SettingsService);
    const mockUser = { id: "user-1", tenantId: "tenant-1" } as unknown as AuthUser;
    const input: TemplateInput = {
      key: "greeting",
      label: "Greeting",
      body: "Halo {customerName}",
    };
    const result = await controller.update(mockUser, "greeting", input);

    expect(result?.body).toBe("Halo2");
    expect(serviceMock.updateTemplate).toHaveBeenCalledWith("tenant-1", "greeting", "Greeting", "Halo {customerName}");
  });
});
