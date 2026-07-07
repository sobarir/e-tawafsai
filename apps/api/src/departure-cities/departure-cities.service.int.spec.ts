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
  departureCities,
  type Database,
} from "@cometkit/db";
import { eq, inArray } from "drizzle-orm";
import { DEFAULT_TENANT_SLUG } from "@cometkit/shared";
import { TenantScopedDb } from "../tenancy/tenant-scoped-db";
import { DepartureCitiesService } from "./departure-cities.service";

config({ path: resolve(__dirname, "../../../../.env") });

const noopLogger = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
} as never;

describe("DepartureCitiesService (integration)", () => {
  let db: Database;
  let service: DepartureCitiesService;
  let tenantId: string;
  const createdPackageIds: string[] = [];
  const createdProviderIds: string[] = [];
  const createdDepartureCityIds: string[] = [];
  const suffix = ulid().toLowerCase();

  async function createProvider(): Promise<string> {
    const id = ulid();
    await db.insert(providers).values({
      id,
      tenantId,
      name: `PT. City Provider ${suffix}-${id.slice(-6)}`,
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
    const [tenant] = await db
      .select()
      .from(tenants)
      .where(eq(tenants.slug, DEFAULT_TENANT_SLUG));
    if (!tenant) throw new Error("Default tenant not seeded - run bun run db:seed first");
    tenantId = tenant.id;

    const cls = { get: () => tenantId } as unknown as ClsService;
    const scoped = new TenantScopedDb(db, cls);
    service = new DepartureCitiesService(scoped, db, noopLogger);
  });

  afterAll(async () => {
    // Packages reference departure cities via departureCityId — delete packages first.
    if (createdPackageIds.length > 0) {
      await db.delete(packages).where(inArray(packages.id, createdPackageIds));
    }
    if (createdDepartureCityIds.length > 0) {
      await db.delete(departureCities).where(inArray(departureCities.id, createdDepartureCityIds));
    }
    if (createdProviderIds.length > 0) {
      await db.delete(providers).where(inArray(providers.id, createdProviderIds));
    }
  });

  it("creates a departure city scoped to the tenant", async () => {
    const city = await service.create({ name: `Jakarta ${suffix}` });
    createdDepartureCityIds.push(city.id);

    expect(city.id).toHaveLength(26);
    expect(city.name).toBe(`Jakarta ${suffix}`);
    expect(city.isActive).toBe(true);
    expect(city.tenantId).toBe(tenantId);
  });

  it("rejects a duplicate normalized name in the same tenant", async () => {
    const first = await service.create({ name: `Surabaya ${suffix}` });
    createdDepartureCityIds.push(first.id);

    await expect(
      service.create({ name: `  surabaya ${suffix}  ` }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("removes a departure city that no package references", async () => {
    const city = await service.create({ name: `Unused City ${suffix}` });

    await service.remove(city.id);

    const gone = await service.findById(city.id);
    expect(gone).toBeUndefined();
  });

  it("blocks removal of a departure city referenced by a package, leaving it intact", async () => {
    const providerId = await createProvider();
    const city = await service.create({ name: `In Use City ${suffix}` });
    createdDepartureCityIds.push(city.id);

    const [pkg] = await db
      .insert(packages)
      .values({
        id: ulid(),
        tenantId,
        providerId,
        productType: "umrah",
        title: "Package referencing departure city",
        slug: `package-referencing-city-${suffix}`,
        departureCityId: city.id,
      })
      .returning();
    createdPackageIds.push(pkg!.id);

    await expect(service.remove(city.id)).rejects.toBeInstanceOf(ConflictException);

    const stillExists = await service.findById(city.id);
    expect(stillExists).toBeDefined();
  });
});
