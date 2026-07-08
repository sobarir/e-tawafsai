import { describe, it, expect } from "vitest";
import { daysUntil, toDepartureSignal, type DepartureRow } from "./dashboard.service";

describe("daysUntil", () => {
  const now = new Date("2026-07-08T00:00:00.000Z");

  it("counts whole days ahead", () => {
    expect(daysUntil(new Date("2026-07-10T00:00:00.000Z"), now)).toBe(2);
  });

  it("is 0 for the same day", () => {
    expect(daysUntil(new Date("2026-07-08T10:00:00.000Z"), now)).toBe(0);
  });

  it("rounds a partial day up", () => {
    expect(daysUntil(new Date("2026-07-09T06:00:00.000Z"), now)).toBe(1);
  });
});

describe("toDepartureSignal", () => {
  it("maps a raw row to a DepartureSignal with ISO date", () => {
    const row: DepartureRow = {
      departure_id: "d1",
      package_id: "p1",
      package_title: "Umrah Akbar",
      departure_date: "2026-08-14T00:00:00.000Z",
      seats_left: 12,
    };
    expect(toDepartureSignal(row)).toEqual({
      departureId: "d1",
      packageId: "p1",
      packageTitle: "Umrah Akbar",
      departureDate: "2026-08-14T00:00:00.000Z",
      seatsLeft: 12,
    });
  });

  it("accepts a Date instance for departure_date", () => {
    const sig = toDepartureSignal({
      departure_id: "d2",
      package_id: "p2",
      package_title: "Umrah Hemat",
      departure_date: new Date("2026-09-01T00:00:00.000Z"),
      seats_left: 3,
    });
    expect(sig.departureDate).toBe("2026-09-01T00:00:00.000Z");
  });
});
