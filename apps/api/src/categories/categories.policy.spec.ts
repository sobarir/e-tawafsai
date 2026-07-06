import { describe, it, expect } from "vitest";
import {
  normalizeCategoryName,
  categoryMatchesScope,
  toCategoryDto,
  toStaffCategoryDto,
} from "./categories.policy";
import type { DbPackageCategory } from "@cometkit/db";

const row: DbPackageCategory = {
  id: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
  tenantId: "01TENANT0000000000000000AA",
  providerId: "01PROV0000000000000000000A",
  productType: "umrah",
  name: "VIP",
  commissionType: "flat_per_pax",
  commissionValue: 500000,
  createdAt: new Date("2026-07-06T00:00:00Z"),
  updatedAt: new Date("2026-07-06T00:00:00Z"),
};

describe("categories.policy", () => {
  it("normalizes name (lowercased, trimmed)", () => {
    expect(normalizeCategoryName("  ViP ")).toBe("vip");
  });

  it("matches scope by provider + productType", () => {
    expect(categoryMatchesScope(row, "01PROV0000000000000000000A", "umrah")).toBe(true);
    expect(categoryMatchesScope(row, "01PROV0000000000000000000A", "haji_khusus")).toBe(false);
    expect(categoryMatchesScope(row, "01OTHER000000000000000000A", "umrah")).toBe(false);
  });

  it("admin DTO includes commission; staff DTO strips it", () => {
    const admin = toCategoryDto(row);
    expect(admin.commissionValue).toBe(500000);
    const staff = toStaffCategoryDto(row) as Record<string, unknown>;
    expect(staff.commissionType).toBeUndefined();
    expect(staff.commissionValue).toBeUndefined();
    expect(staff.name).toBe("VIP");
  });
});
