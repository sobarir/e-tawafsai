import { describe, it, expect } from "vitest";
import { toPublicPackageCardDto, type PublicPackageRow } from "./public-packages.mapper";

const row: PublicPackageRow = {
  title: "Umrah Akbar",
  slug: "umrah-akbar",
  category: "Regular",
  airline: "Saudia",
  hotels: [
    { cityName: "Makkah", name: "Swissotel", stars: 5, distanceM: 50, isPelataran: true },
  ],
  next_departure_date: "2026-08-14T00:00:00.000Z",
  price_from: 35000000,
  seats_left: 45,
};

describe("toPublicPackageCardDto", () => {
  it("emits only marketing-safe fields", () => {
    const dto = toPublicPackageCardDto(row);
    expect(Object.keys(dto).sort()).toEqual([
      "airline",
      "category",
      "hotels",
      "nearestDepartureDate",
      "seatsAvailable",
      "slug",
      "startingPriceIdr",
      "title",
    ]);
  });

  it("keeps hotel isPelataran and maps fields", () => {
    const dto = toPublicPackageCardDto(row);
    expect(dto.title).toBe("Umrah Akbar");
    expect(dto.startingPriceIdr).toBe(35000000);
    expect(dto.seatsAvailable).toBe(45);
    expect(dto.nearestDepartureDate).toBe("2026-08-14T00:00:00.000Z");
    expect(dto.hotels[0]).toEqual({
      cityName: "Makkah",
      name: "Swissotel",
      stars: 5,
      distanceM: 50,
      isPelataran: true,
    });
  });

  it("handles a package with no upcoming departure", () => {
    const dto = toPublicPackageCardDto({
      ...row,
      next_departure_date: null,
      price_from: null,
      seats_left: 0,
    });
    expect(dto.nearestDepartureDate).toBeNull();
    expect(dto.startingPriceIdr).toBeNull();
    expect(dto.seatsAvailable).toBe(0);
  });

  it("accepts a Date instance for next_departure_date", () => {
    const dto = toPublicPackageCardDto({
      ...row,
      next_departure_date: new Date("2026-09-01T00:00:00.000Z"),
    });
    expect(dto.nearestDepartureDate).toBe("2026-09-01T00:00:00.000Z");
  });
});
