import { describe, it, expect } from "vitest";
import { normalizeAirlineName, toAirlineDto } from "./airlines.policy";

describe("airlines.policy", () => {
  it("normalizes name (trim + lowercase)", () => {
    expect(normalizeAirlineName("  Garuda Indonesia ")).toBe("garuda indonesia");
  });

  it("maps a row to a dto with ISO timestamps", () => {
    const now = new Date("2026-07-07T00:00:00Z");
    const dto = toAirlineDto({
      id: "a1",
      tenantId: "t1",
      name: "Saudia",
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });
    expect(dto).toEqual({
      id: "a1",
      tenantId: "t1",
      name: "Saudia",
      isActive: true,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    });
  });
});
