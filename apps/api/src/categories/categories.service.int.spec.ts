import { ConflictException } from "@nestjs/common";
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
  type Database,
} from "@cometkit/db";
import { eq, inArray } from "drizzle-orm";
import { DEFAULT_TENANT_SLUG } from "@cometkit/shared";
import { TenantScopedDb } from "../tenancy/tenant-scoped-db";
import { CategoriesService } from "./categories.service";

config({ path: resolve(__dirname, "../../../../.env") });

const noopLogger = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
} as never;

describe("CategoriesService (integration)", () => {
  let db: Database;
  let service: CategoriesService;
  let tenantId: string;
  const createdPackageIds: string[] = [];
  const createdProviderIds: string[] = [];
  const createdCategoryIds: string[] = [];
  const suffix = ulid().toLowerCase();

  async function createProvider(overrides: Partial<{ defaultCommissionType: string; defaultCommissionValue: number }> = {}) {
    const id = ulid();
    await db.insert(providers).values({
      id,
      tenantId,
      name: `PT. Category Provider ${suffix}-${id.slice(-6)}`,
      brandName: "Brand",
      ppiuLicenseNo: `PPIU-${id.slice(-6)}`,
      accreditation: "A",
      contactPerson: "Budi",
      contactPhone: "62812345678",
      isActive: true,
      pricePublicationConsentAt: new Date(),
      defaultCommissionType: (overrides.defaultCommissionType as never) ?? "flat_per_pax",
      defaultCommissionValue: overrides.defaultCommissionValue ?? 0,
    });
    createdProviderIds.push(id);
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

    const cls = { get: () => tenantId } as unknown as ClsService;
    const scoped = new TenantScopedDb(db, cls);
    service = new CategoriesService(scoped, db, noopLogger);
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
  });

  it("seeds commission from the provider default when omitted", async () => {
    const providerId = await createProvider({
      defaultCommissionType: "flat_per_pax",
      defaultCommissionValue: 500000,
    });

    const category = await service.create({
      providerId,
      productType: "umrah",
      name: "VIP",
    });
    createdCategoryIds.push(category.id);

    expect(category.commissionType).toBe("flat_per_pax");
    expect(category.commissionValue).toBe(500000);
  });

  it("uses explicit commission values when provided", async () => {
    const providerId = await createProvider({
      defaultCommissionType: "flat_per_pax",
      defaultCommissionValue: 500000,
    });

    const category = await service.create({
      providerId,
      productType: "umrah",
      name: "Explicit Commission",
      commissionType: "percent_of_price",
      commissionValue: 15,
    });
    createdCategoryIds.push(category.id);

    expect(category.commissionType).toBe("percent_of_price");
    expect(category.commissionValue).toBe(15);
  });

  it("rejects a duplicate normalized name in the same (provider, productType) scope", async () => {
    const providerId = await createProvider();

    const first = await service.create({
      providerId,
      productType: "umrah",
      name: "Regular",
    });
    createdCategoryIds.push(first.id);

    await expect(
      service.create({
        providerId,
        productType: "umrah",
        name: "  regular  ",
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("allows the same name under a different productType or provider", async () => {
    const providerId = await createProvider();
    const otherProviderId = await createProvider();

    const first = await service.create({
      providerId,
      productType: "umrah",
      name: "Shared Name",
    });
    createdCategoryIds.push(first.id);

    const differentProductType = await service.create({
      providerId,
      productType: "haji_furoda",
      name: "Shared Name",
    });
    createdCategoryIds.push(differentProductType.id);

    const differentProvider = await service.create({
      providerId: otherProviderId,
      productType: "umrah",
      name: "Shared Name",
    });
    createdCategoryIds.push(differentProvider.id);

    expect(differentProductType.id).not.toBe(first.id);
    expect(differentProvider.id).not.toBe(first.id);
  });

  it("blocks removal of a category referenced by a package, leaving it intact", async () => {
    const providerId = await createProvider();
    const category = await service.create({
      providerId,
      productType: "umrah",
      name: "In Use",
    });
    createdCategoryIds.push(category.id);

    const [pkg] = await db
      .insert(packages)
      .values({
        id: ulid(),
        tenantId,
        providerId,
        productType: "umrah",
        title: "Package referencing category",
        slug: `package-referencing-category-${suffix}`,
        categoryId: category.id,
      })
      .returning();
    createdPackageIds.push(pkg!.id);

    await expect(service.remove(category.id)).rejects.toBeInstanceOf(ConflictException);

    const stillExists = await service.findById(category.id);
    expect(stillExists).toBeDefined();
  });

  it("removes an unused category", async () => {
    const providerId = await createProvider();
    const category = await service.create({
      providerId,
      productType: "umrah",
      name: "Unused",
    });

    await service.remove(category.id);

    const gone = await service.findById(category.id);
    expect(gone).toBeUndefined();
  });

  it("scopes list() to the given provider and productType, respecting tenant isolation", async () => {
    const providerId = await createProvider();
    const otherProviderId = await createProvider();

    const umrahCat = await service.create({
      providerId,
      productType: "umrah",
      name: "List Umrah",
    });
    createdCategoryIds.push(umrahCat.id);

    const hajiCat = await service.create({
      providerId,
      productType: "haji_furoda",
      name: "List Haji",
    });
    createdCategoryIds.push(hajiCat.id);

    const otherProviderCat = await service.create({
      providerId: otherProviderId,
      productType: "umrah",
      name: "List Other Provider",
    });
    createdCategoryIds.push(otherProviderCat.id);

    const umrahOnly = await service.list(providerId, "umrah");
    expect(umrahOnly.map((c) => c.id)).toContain(umrahCat.id);
    expect(umrahOnly.map((c) => c.id)).not.toContain(hajiCat.id);
    expect(umrahOnly.map((c) => c.id)).not.toContain(otherProviderCat.id);

    const allForProvider = await service.list(providerId);
    expect(allForProvider.map((c) => c.id)).toEqual(
      expect.arrayContaining([umrahCat.id, hajiCat.id]),
    );
    expect(allForProvider.map((c) => c.id)).not.toContain(otherProviderCat.id);
  });
});
