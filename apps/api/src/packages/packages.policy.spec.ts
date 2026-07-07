import { describe, expect, it } from "vitest";
import { PackagesPolicy } from "./packages.policy";
import { type PackageDto } from "@cometkit/shared";

describe("PackagesPolicy.validatePublishReady", () => {
  const basePkg: PackageDto = {
    id: "pkg_1",
    tenantId: "tenant_1",
    providerId: "prov_1",
    productType: "umrah",
    title: "Umrah Pack",
    slug: "umrah-pack",
    categoryId: "cat_1",
    categoryName: "Regular",
    plusDestination: null,
    durationDays: 9,
    description: null,
    airlineId: "air_1",
    airlineName: "Saudi Arabian Airlines",
    flightRoute: "CGK-MED, JED-CGK",
    departureCityId: "dcity_1",
    departureCityName: "Jakarta",
    isFeatured: false,
    status: "draft",
    needsReview: false,
    hotels: [
      {
        cityName: "Makkah",
        name: "Grand Zamzam",
        stars: 5,
        distanceM: 100,
        isPelataran: false,
      },
    ],
    tags: [],
    flyers: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  it("passes when all required fields and active provider with PPIU license exist", () => {
    const errors = PackagesPolicy.validatePublishReady(basePkg, true, "PPIU-123");
    expect(errors).toEqual([]);
  });

  it("returns errors when required fields are missing", () => {
    const incompletePkg = {
      ...basePkg,
      durationDays: null,
      airlineId: null,
      departureCityId: null,
      hotels: [],
    } as unknown as PackageDto;

    const errors = PackagesPolicy.validatePublishReady(incompletePkg, true, "PPIU-123");
    expect(errors).toContain("durationDays");
    expect(errors).toContain("airline");
    expect(errors).toContain("departureCity");
    expect(errors).toContain("hotels (Makkah)");
  });

  it("fails when provider is inactive or missing PPIU license", () => {
    const errorsInactive = PackagesPolicy.validatePublishReady(basePkg, false, "PPIU-123");
    expect(errorsInactive).toContain("provider (Inactive)");

    const errorsNoLicense = PackagesPolicy.validatePublishReady(basePkg, true, null);
    expect(errorsNoLicense).toContain("provider (PPIU License Required)");
  });

  it("requires categoryId to publish", () => {
    const noCategoryId = { ...basePkg, categoryId: null } as unknown as PackageDto;
    const errors = PackagesPolicy.validatePublishReady(noCategoryId, true, "PPIU-123");
    expect(errors).toContain("category");

    const withCategoryId = PackagesPolicy.validatePublishReady(basePkg, true, "PPIU-123");
    expect(withCategoryId).not.toContain("category");
  });
});
