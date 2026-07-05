import { describe, expect, it, vi } from "vitest";
import { ProvidersController } from "./providers.controller";
import type { ProvidersService } from "./providers.service";
import type { StorageService } from "../storage/storage.service";
import type { AuthUser } from "@cometkit/shared";

describe("ProvidersController", () => {
  const mockService = {
    create: vi.fn(),
    list: vi.fn().mockResolvedValue({
      data: [
        {
          id: "prov-1",
          name: "PT. Al-Amin",
          brandName: "Al-Amin",
          contactPerson: "Budi",
          contactPhone: "123",
          ppiuLicenseNo: null,
          pihkLicenseNo: null,
          accreditation: "unknown",
          logoUrl: null,
          allowLogoOnPublicPages: false,
          defaultCommissionType: "flat_per_pax",
          defaultCommissionValue: 0,
          commissionNotes: null,
          isActive: false,
          pricePublicationConsentAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
      meta: { page: 1, limit: 10, total: 1, totalPages: 1 },
    }),
    findById: vi.fn(),
    update: vi.fn(),
    activate: vi.fn(),
    deactivate: vi.fn(),
  };

  const mockStorage = {} as unknown as StorageService;

  it("filters commission fields for staff users", async () => {
    const controller = new ProvidersController(
      mockService as unknown as ProvidersService,
      mockStorage,
    );

    const staffUser: AuthUser = {
      id: "staff-1",
      email: "staff@cometkit.dev",
      name: "Staff",
      role: "staff",
      tenantId: "tenant-1",
    };

    const res = await controller.list(staffUser, { page: "1", limit: "10" });
    expect(res.data[0]?.name).toBe("PT. Al-Amin");
    expect((res.data[0] as Record<string, unknown>).defaultCommissionValue).toBeUndefined();
  });

  it("includes commission fields for admin users", async () => {
    const controller = new ProvidersController(
      mockService as unknown as ProvidersService,
      mockStorage,
    );

    const adminUser: AuthUser = {
      id: "admin-1",
      email: "admin@cometkit.dev",
      name: "Admin",
      role: "admin",
      tenantId: "tenant-1",
    };

    const res = await controller.list(adminUser, { page: "1", limit: "10" });
    expect(res.data[0]?.name).toBe("PT. Al-Amin");
    expect((res.data[0] as Record<string, unknown>).defaultCommissionValue).toBe(0);
  });
});
