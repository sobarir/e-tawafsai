import { describe, it, expect } from "vitest";
import {
  createAirlineSchema,
  updateAirlineSchema,
  createDepartureCitySchema,
} from "./master-data";

describe("master-data schemas", () => {
  it("accepts a valid airline create", () => {
    const r = createAirlineSchema.parse({ name: "Garuda Indonesia" });
    expect(r.name).toBe("Garuda Indonesia");
    expect(r.isActive).toBe(true); // defaults to active
  });

  it("rejects a blank name", () => {
    expect(() => createAirlineSchema.parse({ name: "" })).toThrow();
  });

  it("allows isActive on update without name", () => {
    const r = updateAirlineSchema.parse({ isActive: false });
    expect(r.isActive).toBe(false);
  });

  it("departure-city create mirrors airline", () => {
    const r = createDepartureCitySchema.parse({ name: "Jakarta" });
    expect(r.name).toBe("Jakarta");
  });
});
