import { BadRequestException } from "@nestjs/common";
import { config } from "dotenv";
import { resolve } from "node:path";
import { ulid } from "ulid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ClsService } from "nestjs-cls";
import { createDb, tenants, providers, packages, type Database } from "@cometkit/db";
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
  const createdPackageIds: string[] = [];
  const createdProviderIds: string[] = [];
  const suffix = ulid().toLowerCase();

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
    const pId = ulid();
    await db.insert(providers).values({
      id: pId,
      tenantId,
      name: `PT. Provider ${suffix}`,
      brandName: "Brand",
      ppiuLicenseNo: "PPIU-Test",
      accreditation: "A",
      contactPerson: "Budi",
      contactPhone: "62812345678",
      isActive: true,
      pricePublicationConsentAt: new Date(),
    });
    providerId = pId;
    createdProviderIds.push(pId);

    const cls = { get: () => tenantId } as unknown as ClsService;
    const scoped = new TenantScopedDb(db, cls);
    service = new PackagesService(scoped, db, noopLogger);
  });

  afterAll(async () => {
    if (createdPackageIds.length > 0) {
      await db.delete(packages).where(inArray(packages.id, createdPackageIds));
    }
    if (createdProviderIds.length > 0) {
      await db.delete(providers).where(inArray(providers.id, createdProviderIds));
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
      airline: "Garuda Indonesia",
      departureCity: "Jakarta",
      category: "regular",
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
});
