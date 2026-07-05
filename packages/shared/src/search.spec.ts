import { describe, expect, it } from "vitest";
import { searchPackagesSchema } from "./search";

describe("searchPackagesSchema", () => {
  it("applies defaults for occupancy and pagination on empty input", () => {
    const parsed = searchPackagesSchema.parse({});
    expect(parsed.occupancy).toBe("quad");
    expect(parsed.page).toBe(1);
    expect(parsed.pageSize).toBe(20);
    expect(parsed.seatsAvailableOnly).toBe(false);
    expect(parsed.directOnly).toBe(false);
  });

  it("coerces numeric and boolean query-string values", () => {
    const parsed = searchPackagesSchema.parse({
      maxPrice: "30000000",
      durationMin: "9",
      minStars: "4",
      seatsAvailableOnly: "true",
      directOnly: "true",
      page: "2",
    });
    expect(parsed.maxPrice).toBe(30000000);
    expect(parsed.durationMin).toBe(9);
    expect(parsed.minStars).toBe(4);
    expect(parsed.seatsAvailableOnly).toBe(true);
    expect(parsed.directOnly).toBe(true);
    expect(parsed.page).toBe(2);
  });

  it("treats the string 'false' as boolean false (query-string round-trip)", () => {
    const parsed = searchPackagesSchema.parse({
      directOnly: "false",
      seatsAvailableOnly: "false",
    });
    expect(parsed.directOnly).toBe(false);
    expect(parsed.seatsAvailableOnly).toBe(false);
  });

  it("accepts the canonical hotel cities and occupancy values", () => {
    const parsed = searchPackagesSchema.parse({ hotelCity: "Makkah", occupancy: "triple" });
    expect(parsed.hotelCity).toBe("Makkah");
    expect(parsed.occupancy).toBe("triple");
  });

  it("rejects an out-of-range occupancy", () => {
    expect(searchPackagesSchema.safeParse({ occupancy: "suite" }).success).toBe(false);
  });
});
