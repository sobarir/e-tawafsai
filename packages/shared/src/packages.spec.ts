import { describe, expect, it } from "vitest";
import { createPackageSchema, publishPackageSchema } from "./packages";

const ULID = "01H00000000000000000000000"; // 26 chars

describe("Package schema validation", () => {
  it("validates create payload", () => {
    const parsed = createPackageSchema.safeParse({
      title: "Umrah Regular 9 Days",
      providerId: "01H00000000000000000000000",
      productType: "umrah",
    });
    expect(parsed.success).toBe(true);
  });

  it("accepts nullable airlineId / departureCityId on create", () => {
    const r = createPackageSchema.parse({
      title: "X",
      providerId: ULID,
      airlineId: null,
      departureCityId: null,
    });
    expect(r.airlineId).toBeNull();
  });

  it("publish requires airlineId and departureCityId", () => {
    expect(() =>
      publishPackageSchema.parse({ durationDays: 9, categoryId: ULID, departureCityId: ULID }),
    ).toThrow();
    const ok = publishPackageSchema.parse({
      durationDays: 9,
      categoryId: ULID,
      airlineId: ULID,
      departureCityId: ULID,
    });
    expect(ok.airlineId).toBe(ULID);
  });
});
