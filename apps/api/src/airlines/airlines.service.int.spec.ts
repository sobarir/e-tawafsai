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
  airlines,
  type Database,
} from "@cometkit/db";
import { eq, inArray } from "drizzle-orm";
import { DEFAULT_TENANT_SLUG } from "@cometkit/shared";
import { TenantScopedDb } from "../tenancy/tenant-scoped-db";
import { AirlinesService } from "./airlines.service";

config({ path: resolve(__dirname, "../../../../.env") });

const noopLogger = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
} as never;

describe("AirlinesService (integration)", () => {
  let db: Database;
  let service: AirlinesService;
  let tenantId: string;
  const createdPackageIds: string[] = [];
  const createdProviderIds: string[] = [];
  const createdAirlineIds: string[] = [];
  const suffix = ulid().toLowerCase();

  async function createProvider(): Promise<string> {
    const id = ulid();
    await db.insert(providers).values({
      id,
      tenantId,
      name: `PT. Airline Provider ${suffix}-${id.slice(-6)}`,
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
    service = new AirlinesService(scoped, db, noopLogger);
  });

  afterAll(async () => {
    // Packages reference airlines via airlineId — delete packages first.
    if (createdPackageIds.length > 0) {
      await db.delete(packages).where(inArray(packages.id, createdPackageIds));
    }
    if (createdAirlineIds.length > 0) {
      await db.delete(airlines).where(inArray(airlines.id, createdAirlineIds));
    }
    if (createdProviderIds.length > 0) {
      await db.delete(providers).where(inArray(providers.id, createdProviderIds));
    }
  });

  it("creates an airline scoped to the tenant", async () => {
    const airline = await service.create({ name: `Garuda ${suffix}` });
    createdAirlineIds.push(airline.id);

    expect(airline.id).toHaveLength(26);
    expect(airline.name).toBe(`Garuda ${suffix}`);
    expect(airline.isActive).toBe(true);
    expect(airline.tenantId).toBe(tenantId);
  });

  it("rejects a duplicate normalized name in the same tenant", async () => {
    const first = await service.create({ name: `Lion Air ${suffix}` });
    createdAirlineIds.push(first.id);

    await expect(
      service.create({ name: `  lion air ${suffix}  ` }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("removes an airline that no package references", async () => {
    const airline = await service.create({ name: `Unused Air ${suffix}` });

    await service.remove(airline.id);

    const gone = await service.findById(airline.id);
    expect(gone).toBeUndefined();
  });

  it("blocks removal of an airline referenced by a package, leaving it intact", async () => {
    const providerId = await createProvider();
    const airline = await service.create({ name: `In Use Air ${suffix}` });
    createdAirlineIds.push(airline.id);

    const [pkg] = await db
      .insert(packages)
      .values({
        id: ulid(),
        tenantId,
        providerId,
        productType: "umrah",
        title: "Package referencing airline",
        slug: `package-referencing-airline-${suffix}`,
        airlineId: airline.id,
      })
      .returning();
    createdPackageIds.push(pkg!.id);

    await expect(service.remove(airline.id)).rejects.toBeInstanceOf(ConflictException);

    const stillExists = await service.findById(airline.id);
    expect(stillExists).toBeDefined();
  });
});
