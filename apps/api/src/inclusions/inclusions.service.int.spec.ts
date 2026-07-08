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
  inclusions,
  packageInclusions,
  type Database,
} from "@cometkit/db";
import { eq, inArray } from "drizzle-orm";
import { DEFAULT_TENANT_SLUG } from "@cometkit/shared";
import { TenantScopedDb } from "../tenancy/tenant-scoped-db";
import { InclusionsService } from "./inclusions.service";

config({ path: resolve(__dirname, "../../../../.env") });

const noopLogger = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
} as never;

describe("InclusionsService (integration)", () => {
  let db: Database;
  let service: InclusionsService;
  let tenantId: string;
  const createdPackageIds: string[] = [];
  const createdProviderIds: string[] = [];
  const createdInclusionIds: string[] = [];
  const suffix = ulid().toLowerCase();

  async function createProvider(): Promise<string> {
    const id = ulid();
    await db.insert(providers).values({
      id,
      tenantId,
      name: `PT. Inclusion Provider ${suffix}-${id.slice(-6)}`,
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
    service = new InclusionsService(scoped, db, noopLogger);
  });

  afterAll(async () => {
    if (createdPackageIds.length > 0) {
      await db.delete(packageInclusions).where(inArray(packageInclusions.packageId, createdPackageIds));
      await db.delete(packages).where(inArray(packages.id, createdPackageIds));
    }
    if (createdInclusionIds.length > 0) {
      await db.delete(inclusions).where(inArray(inclusions.id, createdInclusionIds));
    }
    if (createdProviderIds.length > 0) {
      await db.delete(providers).where(inArray(providers.id, createdProviderIds));
    }
  });

  it("creates an inclusion scoped to the tenant", async () => {
    const inc = await service.create({ name: `Inclusion ${suffix}` });
    createdInclusionIds.push(inc.id);

    expect(inc.id).toHaveLength(26);
    expect(inc.name).toBe(`Inclusion ${suffix}`);
    expect(inc.isActive).toBe(true);
    expect(inc.tenantId).toBe(tenantId);
  });

  it("rejects a duplicate normalized name in the same tenant", async () => {
    const first = await service.create({ name: `Dup Inclusion ${suffix}` });
    createdInclusionIds.push(first.id);

    await expect(
      service.create({ name: `  dup inclusion ${suffix}  ` }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("removes an inclusion that no package references", async () => {
    const inc = await service.create({ name: `Unused Inclusion ${suffix}` });

    await service.remove(inc.id);

    const gone = await service.findById(inc.id);
    expect(gone).toBeUndefined();
  });

  it("blocks removal of an inclusion referenced by a package, leaving it intact", async () => {
    const providerId = await createProvider();
    const inc = await service.create({ name: `In Use Inclusion ${suffix}` });
    createdInclusionIds.push(inc.id);

    const [pkg] = await db
      .insert(packages)
      .values({
        id: ulid(),
        tenantId,
        providerId,
        productType: "umrah",
        title: "Package referencing inclusion",
        slug: `package-referencing-inclusion-${suffix}`,
      })
      .returning();
    createdPackageIds.push(pkg!.id);

    await db.insert(packageInclusions).values({
      packageId: pkg!.id,
      inclusionId: inc.id,
    });

    await expect(service.remove(inc.id)).rejects.toBeInstanceOf(ConflictException);

    const stillExists = await service.findById(inc.id);
    expect(stillExists).toBeDefined();
  });
});
