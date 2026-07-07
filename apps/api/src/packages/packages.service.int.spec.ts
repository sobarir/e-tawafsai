import { BadRequestException } from "@nestjs/common";
import { config } from "dotenv";
import { resolve } from "node:path";
import { ulid } from "ulid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ClsService } from "nestjs-cls";
import {
  createDb,
  tenants,
  providers,
  packages,
  packageCategories,
  airlines,
  departureCities,
  type Database,
} from "@cometkit/db";
import { eq, inArray } from "drizzle-orm";
import { DEFAULT_TENANT_SLUG } from "@cometkit/shared";
import { TenantScopedDb } from "../tenancy/tenant-scoped-db";
import { PackagesService } from "./packages.service";

config({ path: resolve(__dirname, "../../../../.env") });

const noopLogger = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
} as never;

describe("PackagesService (integration)", () => {
  let db: Database;
  let service: PackagesService;
  let tenantId: string;
  let providerId: string;
  let airlineId: string;
  let departureCityId: string;
  const createdPackageIds: string[] = [];
  const createdProviderIds: string[] = [];
  const createdCategoryIds: string[] = [];
  const createdAirlineIds: string[] = [];
  const createdDepartureCityIds: string[] = [];
  const suffix = ulid().toLowerCase();

  async function createAirline(name: string): Promise<string> {
    const id = ulid();
    await db.insert(airlines).values({ id, tenantId, name });
    createdAirlineIds.push(id);
    return id;
  }

  async function createDepartureCity(name: string): Promise<string> {
    const id = ulid();
    await db.insert(departureCities).values({ id, tenantId, name });
    createdDepartureCityIds.push(id);
    return id;
  }

  async function createProvider(): Promise<string> {
    const id = ulid();
    await db.insert(providers).values({
      id,
      tenantId,
      name: `PT. Provider ${suffix}-${id.slice(-6)}`,
      brandName: "Brand",
      ppiuLicenseNo: `PPIU-${id.slice(-6)}`,
      accreditation: "A",
      contactPerson: "Budi",
      contactPhone: "62812345678",
      isActive: true,
      pricePublicationConsentAt: new Date(),
    });
    createdProviderIds.push(id);
    return id;
  }

  async function createCategory(
    forProviderId: string,
    productType: string,
    name: string,
  ): Promise<string> {
    const id = ulid();
    await db.insert(packageCategories).values({
      id,
      tenantId,
      providerId: forProviderId,
      productType: productType as never,
      name,
    });
    createdCategoryIds.push(id);
    return id;
  }

  beforeAll(async () => {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL required for integration tests");
    db = createDb(url);
    const [tenant] = await db
      .select()
      .from(tenants)
      .where(eq(tenants.slug, DEFAULT_TENANT_SLUG));
    if (!tenant) throw new Error("Default tenant not seeded - run bun run db:seed first");
    tenantId = tenant.id;

    // Create a helper active provider for package associations
    providerId = await createProvider();
    airlineId = await createAirline(`Bench Air ${suffix}`);
    departureCityId = await createDepartureCity(`Bench City ${suffix}`);

    const cls = { get: () => tenantId } as unknown as ClsService;
    const scoped = new TenantScopedDb(db, cls);
    service = new PackagesService(scoped, db, noopLogger);
  });

  afterAll(async () => {
    // Packages reference categories via categoryId — delete packages first.
    if (createdPackageIds.length > 0) {
      await db.delete(packages).where(inArray(packages.id, createdPackageIds));
    }
    if (createdCategoryIds.length > 0) {
      await db.delete(packageCategories).where(inArray(packageCategories.id, createdCategoryIds));
    }
    if (createdProviderIds.length > 0) {
      await db.delete(providers).where(inArray(providers.id, createdProviderIds));
    }
    if (createdAirlineIds.length > 0) {
      await db.delete(airlines).where(inArray(airlines.id, createdAirlineIds));
    }
    if (createdDepartureCityIds.length > 0) {
      await db.delete(departureCities).where(inArray(departureCities.id, createdDepartureCityIds));
    }
  });

  it("handles basic CRUD and slug generation", async () => {
    // 1. Create Draft package
    const pkg1 = await service.create({
      title: "Umrah Promo 9 Days",
      providerId,
      productType: "umrah",
    });
    createdPackageIds.push(pkg1.id);
    expect(pkg1.slug).toBe("umrah-promo-9-days");
    expect(pkg1.status).toBe("draft");

    // 2. Slug Collision within tenant
    const pkg2 = await service.create({
      title: "Umrah Promo 9 Days",
      providerId,
      productType: "umrah",
    });
    createdPackageIds.push(pkg2.id);
    expect(pkg2.slug).not.toBe("umrah-promo-9-days");
    expect(pkg2.slug).toContain("umrah-promo-9-days-");

    // 3. Reject non-umrah product types
    await expect(
      service.create({
        title: "Haji Furoda Super Pack",
        providerId,
        productType: "haji_furoda",
      })
    ).rejects.toThrow();
  });

  it("enforces publish validation rules and deactivation cascade", async () => {
    const categoryId = await createCategory(providerId, "umrah", `Regular ${suffix}`);

    // 1. Create a draft package
    const pkg = await service.create({
      title: "Umrah Exclusive",
      providerId,
      productType: "umrah",
    });
    createdPackageIds.push(pkg.id);

    // 2. Publish without fields -> fails
    await expect(service.publish(pkg.id)).rejects.toBeInstanceOf(BadRequestException);

    // 3. Update fields but without hotel -> fails
    await service.update(pkg.id, {
      durationDays: 9,
      airlineId,
      departureCityId,
      categoryId,
    });
    await expect(service.publish(pkg.id)).rejects.toBeInstanceOf(BadRequestException);

    // 4. Add Makkah hotel
    await service.addHotel(pkg.id, {
      cityName: "Makkah",
      name: "Hilton Suites Makkah",
      stars: 5,
      distanceM: 50,
      isPelataran: false,
    });

    // 5. Publish -> succeeds!
    const published = await service.publish(pkg.id);
    expect(published.status).toBe("published");

    // 6. Slug is immutable after first publish
    const updated = await service.update(pkg.id, { title: "New Title That Changes Slug" });
    expect(updated.slug).toBe("umrah-exclusive"); // Slug remained stable

    // 7. Cascade unpublish on provider deactivation
    // First, deactivate the provider
    await db.update(providers).set({ isActive: false }).where(eq(providers.id, providerId));
    await service.cascadeUnpublishForProvider(providerId);

    const checkPkg = await service.findOne(pkg.id);
    expect(checkPkg.status).toBe("draft");
  });

  it("blocks publish with a category field error when categoryId is unset", async () => {
    const localProviderId = await createProvider();
    const pkg = await service.create({
      title: "Category Required Pack",
      providerId: localProviderId,
      productType: "umrah",
    });
    createdPackageIds.push(pkg.id);

    await service.update(pkg.id, {
      durationDays: 9,
      airlineId,
      departureCityId,
    });
    await service.addHotel(pkg.id, {
      cityName: "Makkah",
      name: "Hilton Suites Makkah",
      stars: 5,
      distanceM: 50,
      isPelataran: false,
    });

    // categoryId is still null -> publish is blocked specifically on "category"
    await expect(service.publish(pkg.id)).rejects.toMatchObject({
      message: expect.stringContaining("category"),
    });
  });

  it("gates publish on missing airline/departure city and resolves their names once assigned", async () => {
    const localProviderId = await createProvider();
    const categoryId = await createCategory(localProviderId, "umrah", `Airline Gate ${suffix}`);
    const localAirlineId = await createAirline(`Assigned Air ${suffix}`);
    const localDepartureCityId = await createDepartureCity(`Assigned City ${suffix}`);

    const pkg = await service.create({
      title: "Airline Gate Pack",
      providerId: localProviderId,
      productType: "umrah",
      categoryId,
    });
    createdPackageIds.push(pkg.id);

    await service.addHotel(pkg.id, {
      cityName: "Makkah",
      name: "Hilton Suites Makkah",
      stars: 5,
      distanceM: 50,
      isPelataran: false,
    });

    // Only the departure city set -> publish is blocked, naming "airline".
    await service.update(pkg.id, { durationDays: 9, departureCityId: localDepartureCityId });
    await expect(service.publish(pkg.id)).rejects.toMatchObject({
      message: expect.stringContaining("airline"),
    });

    // Now only the airline set (city cleared) -> publish is blocked, naming "departureCity".
    await service.update(pkg.id, { airlineId: localAirlineId, departureCityId: null });
    await expect(service.publish(pkg.id)).rejects.toMatchObject({
      message: expect.stringContaining("departureCity"),
    });

    // Both assigned -> publish succeeds and the DTO carries the resolved names.
    await service.update(pkg.id, { departureCityId: localDepartureCityId });
    const published = await service.publish(pkg.id);
    expect(published.status).toBe("published");

    const detail = await service.findOne(pkg.id);
    expect(detail.airlineId).toBe(localAirlineId);
    expect(detail.airlineName).toBe(`Assigned Air ${suffix}`);
    expect(detail.departureCityId).toBe(localDepartureCityId);
    expect(detail.departureCityName).toBe(`Assigned City ${suffix}`);
  });

  it("rejects a categoryId that belongs to another provider or productType", async () => {
    const localProviderId = await createProvider();
    const otherProviderId = await createProvider();
    const otherProviderCategoryId = await createCategory(otherProviderId, "umrah", `Other Provider ${suffix}`);
    const otherProductTypeCategoryId = await createCategory(localProviderId, "haji_furoda", `Other Product ${suffix}`);

    // Wrong provider scope, on create
    await expect(
      service.create({
        title: "Cross Provider Category Pack",
        providerId: localProviderId,
        productType: "umrah",
        categoryId: otherProviderCategoryId,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    // Wrong productType scope, on update
    const pkg = await service.create({
      title: "Cross ProductType Category Pack",
      providerId: localProviderId,
      productType: "umrah",
    });
    createdPackageIds.push(pkg.id);

    await expect(
      service.update(pkg.id, { categoryId: otherProductTypeCategoryId }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects an update that changes providerId without a categoryId, leaving a stale out-of-scope category", async () => {
    const providerA = await createProvider();
    const providerB = await createProvider();
    const categoryA = await createCategory(providerA, "umrah", `Provider A Category ${suffix}`);
    await createCategory(providerB, "umrah", `Provider B Category ${suffix}`);

    // Package created under provider A with provider A's category - valid at creation time.
    const pkg = await service.create({
      title: "Provider Switch Pack",
      providerId: providerA,
      productType: "umrah",
      categoryId: categoryA,
    });
    createdPackageIds.push(pkg.id);

    // Switching providerId to B WITHOUT sending categoryId must re-validate the
    // existing categoryId (still categoryA, which belongs to provider A) against
    // the new effective provider (B) - and reject it.
    await expect(
      service.update(pkg.id, { providerId: providerB }),
    ).rejects.toMatchObject({
      message: expect.stringContaining("category"),
    });

    // The package must remain untouched by the rejected update.
    const untouched = await service.findOne(pkg.id);
    expect(untouched.providerId).toBe(providerA);
    expect(untouched.categoryId).toBe(categoryA);
  });

  it("allows unrelated field updates on a package whose category is still in scope", async () => {
    const localProviderId = await createProvider();
    const categoryId = await createCategory(localProviderId, "umrah", `Stable Scope ${suffix}`);

    const pkg = await service.create({
      title: "Stable Scope Pack",
      providerId: localProviderId,
      productType: "umrah",
      categoryId,
    });
    createdPackageIds.push(pkg.id);

    // Update a field unrelated to provider/productType/category - the existing
    // categoryId is still in-scope for the unchanged provider, so this succeeds.
    const updated = await service.update(pkg.id, { durationDays: 12 });
    expect(updated.durationDays).toBe(12);
    expect(updated.categoryId).toBe(categoryId);
  });

  it("publishes a package with a valid in-scope categoryId", async () => {
    const localProviderId = await createProvider();
    const categoryId = await createCategory(localProviderId, "umrah", `In Scope ${suffix}`);

    const pkg = await service.create({
      title: "In Scope Category Pack",
      providerId: localProviderId,
      productType: "umrah",
      categoryId,
    });
    createdPackageIds.push(pkg.id);

    await service.update(pkg.id, {
      durationDays: 9,
      airlineId,
      departureCityId,
    });
    await service.addHotel(pkg.id, {
      cityName: "Makkah",
      name: "Hilton Suites Makkah",
      stars: 5,
      distanceM: 50,
      isPelataran: false,
    });

    const published = await service.publish(pkg.id);
    expect(published.status).toBe("published");

    const detail = await service.findOne(pkg.id);
    expect(detail.categoryId).toBe(categoryId);
    expect(detail.categoryName).toBe(`In Scope ${suffix}`);
  });
});
