import { describe, it, expect } from "vitest";
import { createHotelSchema, updateHotelSchema } from "./hotels";

describe("hotels schema", () => {
  it("accepts a full valid hotel", () => {
    const parsed = createHotelSchema.parse({
      name: "Hilton Suites",
      city: "Makkah",
      stars: 5,
      distanceM: 150,
      isPelataran: true,
    });
    expect(parsed.name).toBe("Hilton Suites");
    expect(parsed.isActive).toBe(true); // defaulted
  });

  it("rejects stars out of range and empty name", () => {
    expect(() => createHotelSchema.parse({ name: "X", city: "Makkah", stars: 9 })).toThrow();
    expect(() => createHotelSchema.parse({ name: "", city: "Makkah", stars: 5 })).toThrow();
  });

  it("update schema makes everything optional", () => {
    expect(updateHotelSchema.parse({ stars: 4 })).toEqual({ stars: 4 });
  });
});
