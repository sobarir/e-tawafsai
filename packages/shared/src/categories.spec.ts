import { describe, it, expect } from "vitest";
import { createCategorySchema, LEGACY_CATEGORY_NAMES } from "./categories";

describe("category schemas", () => {
  it("exposes the six legacy names for seeding", () => {
    expect(LEGACY_CATEGORY_NAMES).toEqual([
      "Regular", "Plus", "Private VIP", "Ramadan", "Arbain", "Other",
    ]);
  });

  it("accepts a valid category with commission", () => {
    const parsed = createCategorySchema.parse({
      providerId: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
      productType: "umrah",
      name: "VIP",
      commissionType: "flat_per_pax",
      commissionValue: 500000,
    });
    expect(parsed.name).toBe("VIP");
    expect(parsed.commissionValue).toBe(500000);
  });

  it("rejects an empty name", () => {
    expect(() =>
      createCategorySchema.parse({
        providerId: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
        productType: "umrah",
        name: "",
      }),
    ).toThrow();
  });
});
