import { describe, it, expect } from "vitest";
import { normalizeDepartureCityName, toDepartureCityDto } from "./departure-cities.policy";

describe("departure-cities.policy", () => {
  it("normalizes name (trim + lowercase)", () => {
    expect(normalizeDepartureCityName("  Jakarta ")).toBe("jakarta");
  });

  it("maps a row to a dto with ISO timestamps", () => {
    const now = new Date("2026-07-07T00:00:00Z");
    const dto = toDepartureCityDto({
      id: "c1",
      tenantId: "t1",
      name: "Jakarta",
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });
    expect(dto).toEqual({
      id: "c1",
      tenantId: "t1",
      name: "Jakarta",
      isActive: true,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    });
  });
});
