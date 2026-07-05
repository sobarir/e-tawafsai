import { describe, expect, it } from "vitest";
import { createDepartureSchema } from "./departures";

describe("Departure schema validation", () => {
  it("validates valid input", () => {
    const res = createDepartureSchema.safeParse({
      packageId: "01HGGGGGKKKKKQQQQQWWWWWRRR",
      departureType: "fixed_date",
      departureDate: "2026-08-15T00:00:00.000Z",
      returnDate: "2026-08-24T00:00:00.000Z",
      seatTotal: 45,
      currency: "IDR",
      priceQuad: 35000000,
      dpAmount: 5000000,
      paymentSchedule: [
        { name: "DP", amount: 5000000, daysBeforeDeparture: 60 }
      ],
    });
    expect(res.success).toBe(true);
  });

  it("rejects without quad price", () => {
    const res = createDepartureSchema.safeParse({
      packageId: "01HGGGGGKKKKKQQQQQWWWWWRRR",
      departureType: "fixed_date",
      departureDate: "2026-08-15T00:00:00.000Z",
      returnDate: "2026-08-24T00:00:00.000Z",
      seatTotal: 45,
      currency: "IDR",
      dpAmount: 5000000,
      paymentSchedule: [],
    });
    expect(res.success).toBe(false);
  });
});
