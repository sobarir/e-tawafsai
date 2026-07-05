import { describe, expect, it } from "vitest";
import { createPackageSchema } from "./packages";

describe("Package schema validation", () => {
  it("validates create payload", () => {
    const parsed = createPackageSchema.safeParse({
      title: "Umrah Regular 9 Days",
      providerId: "01H00000000000000000000000",
      productType: "umrah",
    });
    expect(parsed.success).toBe(true);
  });
});
