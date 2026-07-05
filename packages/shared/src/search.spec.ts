import { describe, expect, it } from "vitest";
import { searchPackagesSchema, formatWhatsappSummary } from "./search";
import type { SearchResultDto } from "./search";

const baseDto: SearchResultDto = {
  id: "01H00000000000000000000001",
  title: "Umrah Reguler 9 Hari",
  slug: "umrah-reguler-9-hari",
  providerName: "PT. Barokah Wisata",
  providerBrandName: "Barokah Travel",
  ppiuLicenseNo: "U.123 TAHUN 2024",
  category: "regular",
  airline: "Saudia",
  nextDepartureDate: "2026-09-12T00:00:00.000Z",
  priceFrom: 28500000,
  priceByOccupancy: { quad: 28500000, triple: 30500000, double: 33500000 },
  seatsLeft: 7,
  hotels: [
    { cityName: "Makkah", name: "Hilton Suites", stars: 5, distanceM: 150 },
    { cityName: "Madinah", name: "Anwar Al Madinah", stars: 5, distanceM: null },
  ],
  publicUrl: "https://barokah.etawafsai.com/paket/umrah-reguler-9-hari",
};

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

describe("formatWhatsappSummary", () => {
  it("includes name, prices, hotels, airline, seats, link and the PPIU legality line", () => {
    const out = formatWhatsappSummary(baseDto);
    expect(out).toContain("Umrah Reguler 9 Hari");
    expect(out).toContain("Saudia");
    expect(out).toContain("Hilton Suites");
    expect(out).toContain("150 m");
    expect(out).toContain("7"); // seats left
    expect(out).toContain(baseDto.publicUrl);
    expect(out).toContain(
      "Diselenggarakan oleh Barokah Travel — PPIU SK U.123 TAHUN 2024",
    );
  });

  it("omits the PPIU SK clause when the provider has no license", () => {
    const out = formatWhatsappSummary({ ...baseDto, ppiuLicenseNo: null });
    expect(out).toContain("Diselenggarakan oleh Barokah Travel");
    expect(out).not.toContain("PPIU SK");
    expect(out).not.toContain("—");
  });
});
