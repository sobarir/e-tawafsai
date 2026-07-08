import { describe, it, expect } from "vitest";
import { normalizeHotelName, toHotelDto } from "./hotels.policy";

describe("hotels.policy", () => {
  it("normalizes name (trim + lowercase)", () => {
    expect(normalizeHotelName("  Hilton Suites ")).toBe("hilton suites");
  });

  it("maps a row to a dto with ISO timestamps", () => {
    const now = new Date("2026-07-08T00:00:00Z");
    const dto = toHotelDto({
      id: "h1",
      tenantId: "t1",
      name: "Hilton",
      city: "Makkah",
      stars: 5,
      distanceM: 150,
      isPelataran: true,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });
    expect(dto).toEqual({
      id: "h1",
      tenantId: "t1",
      name: "Hilton",
      city: "Makkah",
      stars: 5,
      distanceM: 150,
      isPelataran: true,
      isActive: true,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    });
  });
});
