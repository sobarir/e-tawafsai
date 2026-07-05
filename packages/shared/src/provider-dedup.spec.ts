import { describe, expect, it } from "vitest";
import {
  normalizeProviderName,
  normalizePpiu,
  planProviderMerges,
  type ProviderMergeInput,
} from "./provider-dedup";

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

const row = (over: Partial<ProviderMergeInput> & { id: string }): ProviderMergeInput => ({
  name: "PT X",
  ppiuLicenseNo: null,
  isActive: false,
  ...over,
});

describe("planProviderMerges", () => {
  it("returns no plans when there are no duplicates", () => {
    const plans = planProviderMerges([
      row({ id: "01A", name: "Alpha" }),
      row({ id: "01B", name: "Beta", ppiuLicenseNo: "999" }),
    ]);
    expect(plans).toEqual([]);
  });

  it("clusters transitively across name and ppiu edges (A-name-B-ppiu-C)", () => {
    // A & B share a name; B & C share a PPIU; A and C share neither -> one cluster
    const plans = planProviderMerges([
      row({ id: "01A", name: "PT Al Hijaz" }),
      row({ id: "01B", name: "pt al hijaz ", ppiuLicenseNo: "12345" }),
      row({ id: "01C", name: "Different", ppiuLicenseNo: " 12345 " }),
    ]);
    expect(plans).toHaveLength(1);
    expect(plans[0]).toEqual({ survivorId: "01A", loserIds: ["01B", "01C"] });
  });

  it("prefers an active survivor over an older ULID", () => {
    const plans = planProviderMerges([
      row({ id: "01A", name: "Dup" }), // older, inactive
      row({ id: "01Z", name: "dup", isActive: true }), // newer, active
    ]);
    expect(plans).toEqual([{ survivorId: "01Z", loserIds: ["01A"] }]);
  });

  it("does not cluster blank/null PPIUs together", () => {
    const plans = planProviderMerges([
      row({ id: "01A", name: "One", ppiuLicenseNo: "" }),
      row({ id: "01B", name: "Two", ppiuLicenseNo: "   " }),
    ]);
    expect(plans).toEqual([]);
  });
});
