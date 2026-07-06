import { describe, expect, it } from "vitest";
import { createDepartureSchema } from "./departures";

const base = {
  packageId: "01HGGGGGKKKKKQQQQQWWWWWRRR",
  departureType: "fixed_date" as const,
  departureDate: "2026-08-15T00:00:00.000Z",
  returnDate: "2026-08-24T00:00:00.000Z",
  seatTotal: 45,
  currency: "IDR" as const,
  priceQuad: 35000000,
  dpAmount: 5000000,
  paymentSchedule: [{ name: "DP", amount: 5000000, daysBeforeDeparture: 60 }],
};

describe("Departure schema validation", () => {
  it("validates valid input", () => {
    const res = createDepartureSchema.safeParse(base);
    expect(res.success).toBe(true);
  });

  it("rejects without quad price", () => {
    const { priceQuad: _omit, ...noQuad } = base;
    const res = createDepartureSchema.safeParse({ ...noQuad, paymentSchedule: [] });
    expect(res.success).toBe(false);
  });

  it("accepts a full matrix with discounts below their normal price", () => {
    const res = createDepartureSchema.safeParse({
      ...base,
      priceTriple: 40000000,
      priceDouble: 45000000,
      priceQuadDiscount: 33000000,
      priceTripleDiscount: 38000000,
      priceDoubleDiscount: 44000000,
    });
    expect(res.success).toBe(true);
  });

  it("rejects a discount above its normal counterpart with a field-level error", () => {
    const res = createDepartureSchema.safeParse({
      ...base,
      priceTriple: 40000000,
      priceTripleDiscount: 41000000,
    });
    expect(res.success).toBe(false);
    if (!res.success) {
      const paths = res.error.issues.map((i) => i.path.join("."));
      expect(paths).toContain("priceTripleDiscount");
    }
  });

  it("accepts input with discounts omitted", () => {
    const res = createDepartureSchema.safeParse(base);
    expect(res.success).toBe(true);
  });
});
