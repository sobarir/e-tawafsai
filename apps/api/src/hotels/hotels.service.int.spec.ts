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
  packageHotels,
  hotels,
  type Database,
} from "@cometkit/db";
import { eq, inArray } from "drizzle-orm";
import { DEFAULT_TENANT_SLUG } from "@cometkit/shared";
import { TenantScopedDb } from "../tenancy/tenant-scoped-db";
import { HotelsService } from "./hotels.service";

config({ path: resolve(__dirname, "../../../../.env") });

const noopLogger = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
} as never;

describe("HotelsService (integration)", () => {
  let db: Database;
  let service: HotelsService;
  let tenantId: string;
  const suffix = ulid().toLowerCase();
  const createdHotelIds: string[] = [];
  const createdPackageIds: string[] = [];
  const createdProviderIds: string[] = [];

  async function createProvider(): Promise<string> {
    const id = ulid();
    await db.insert(providers).values({
      id,
      tenantId,
      name: `PT. Hotel Provider ${suffix}-${id.slice(-6)}`,
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

  beforeAll(async () => {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL required for integration tests");
    db = createDb(url);
    const [tenant] = await db.select().from(tenants).where(eq(tenants.slug, DEFAULT_TENANT_SLUG));
    if (!tenant) throw new Error("Default tenant not seeded - run bun run db:seed first");
    tenantId = tenant.id;
    const cls = { get: () => tenantId } as unknown as ClsService;
    service = new HotelsService(new TenantScopedDb(db, cls), db, noopLogger);
  });

  afterAll(async () => {
    if (createdPackageIds.length) await db.delete(packageHotels).where(inArray(packageHotels.packageId, createdPackageIds));
    if (createdPackageIds.length) await db.delete(packages).where(inArray(packages.id, createdPackageIds));
    if (createdHotelIds.length) await db.delete(hotels).where(inArray(hotels.id, createdHotelIds));
    if (createdProviderIds.length) await db.delete(providers).where(inArray(providers.id, createdProviderIds));
  });

  it("creates a hotel scoped to the tenant", async () => {
    const hotel = await service.create({ name: `Hilton ${suffix}`, city: "Makkah", stars: 5, isPelataran: true });
    createdHotelIds.push(hotel.id);
    expect(hotel.id).toHaveLength(26);
    expect(hotel.tenantId).toBe(tenantId);
    expect(hotel.city).toBe("Makkah");
    expect(hotel.isPelataran).toBe(true);
  });

  it("allows the same name in a different city", async () => {
    const a = await service.create({ name: `DupCity ${suffix}`, city: "Makkah", stars: 4 });
    const b = await service.create({ name: `Dupcity ${suffix}`, city: "Madinah", stars: 4 });
    createdHotelIds.push(a.id, b.id);
    expect(b.id).not.toBe(a.id);
  });

  it("rejects a duplicate normalized name+city", async () => {
    const first = await service.create({ name: `Zamzam ${suffix}`, city: "Makkah", stars: 3 });
    createdHotelIds.push(first.id);
    await expect(
      service.create({ name: `  zamzam ${suffix} `, city: " makkah " }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("removes an unreferenced hotel", async () => {
    const hotel = await service.create({ name: `Unused ${suffix}`, city: "Madinah", stars: 3 });
    await service.remove(hotel.id);
    expect(await service.findById(hotel.id)).toBeUndefined();
  });

  it("blocks removal of a referenced hotel, leaving it intact", async () => {
    const providerId = await createProvider();
    const hotel = await service.create({ name: `InUse ${suffix}`, city: "Makkah", stars: 5 });
    createdHotelIds.push(hotel.id);
    const [pkg] = await db
      .insert(packages)
      .values({
        id: ulid(),
        tenantId,
        providerId,
        productType: "umrah",
        title: "Package referencing hotel",
        slug: `pkg-ref-hotel-${suffix}`,
      })
      .returning();
    createdPackageIds.push(pkg!.id);
    await db.insert(packageHotels).values({ id: ulid(), packageId: pkg!.id, hotelId: hotel.id });

    await expect(service.remove(hotel.id)).rejects.toBeInstanceOf(ConflictException);
    expect(await service.findById(hotel.id)).toBeDefined();
  });
});
