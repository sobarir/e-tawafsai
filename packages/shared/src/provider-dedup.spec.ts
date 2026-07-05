import { describe, expect, it } from "vitest";
import { normalizeProviderName, normalizePpiu } from "./provider-dedup";

describe("normalizeProviderName", () => {
  it("lowercases and trims", () => {
    expect(normalizeProviderName("  PT AL HIJAZ ")).toBe("pt al hijaz");
  });
  it("treats case/space variants as equal", () => {
    expect(normalizeProviderName("PT Al Hijaz")).toBe(normalizeProviderName("pt al hijaz "));
  });
});

describe("normalizePpiu", () => {
  it("trims a present value", () => {
    expect(normalizePpiu(" 12345 ")).toBe("12345");
  });
  it("coerces empty / whitespace / nullish to null", () => {
    expect(normalizePpiu("")).toBeNull();
    expect(normalizePpiu("   ")).toBeNull();
    expect(normalizePpiu(null)).toBeNull();
    expect(normalizePpiu(undefined)).toBeNull();
  });
});
