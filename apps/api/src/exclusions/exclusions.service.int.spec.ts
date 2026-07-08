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
  exclusions,
  packageExclusions,
  type Database,
} from "@cometkit/db";
import { eq, inArray } from "drizzle-orm";
import { DEFAULT_TENANT_SLUG } from "@cometkit/shared";
import { TenantScopedDb } from "../tenancy/tenant-scoped-db";
import { ExclusionsService } from "./exclusions.service";

config({ path: resolve(__dirname, "../../../../.env") });

const noopLogger = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
} as never;

describe("ExclusionsService (integration)", () => {
  let db: Database;
  let service: ExclusionsService;
  let tenantId: string;
  const createdPackageIds: string[] = [];
  const createdProviderIds: string[] = [];
  const createdExclusionIds: string[] = [];
  const suffix = ulid().toLowerCase();

  async function createProvider(): Promise<string> {
    const id = ulid();
    await db.insert(providers).values({
      id,
      tenantId,
      name: `PT. Exclusion Provider ${suffix}-${id.slice(-6)}`,
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
    service = new ExclusionsService(scoped, db, noopLogger);
  });

  afterAll(async () => {
    if (createdPackageIds.length > 0) {
      await db.delete(packageExclusions).where(inArray(packageExclusions.packageId, createdPackageIds));
      await db.delete(packages).where(inArray(packages.id, createdPackageIds));
    }
    if (createdExclusionIds.length > 0) {
      await db.delete(exclusions).where(inArray(exclusions.id, createdExclusionIds));
    }
    if (createdProviderIds.length > 0) {
      await db.delete(providers).where(inArray(providers.id, createdProviderIds));
    }
  });

  it("creates an exclusion scoped to the tenant", async () => {
    const exc = await service.create({ name: `Exclusion ${suffix}` });
    createdExclusionIds.push(exc.id);

    expect(exc.id).toHaveLength(26);
    expect(exc.name).toBe(`Exclusion ${suffix}`);
    expect(exc.isActive).toBe(true);
    expect(exc.tenantId).toBe(tenantId);
  });

  it("rejects a duplicate normalized name in the same tenant", async () => {
    const first = await service.create({ name: `Dup Exclusion ${suffix}` });
    createdExclusionIds.push(first.id);

    await expect(
      service.create({ name: `  dup exclusion ${suffix}  ` }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("removes an exclusion that no package references", async () => {
    const exc = await service.create({ name: `Unused Exclusion ${suffix}` });

    await service.remove(exc.id);

    const gone = await service.findById(exc.id);
    expect(gone).toBeUndefined();
  });

  it("blocks removal of an exclusion referenced by a package, leaving it intact", async () => {
    const providerId = await createProvider();
    const exc = await service.create({ name: `In Use Exclusion ${suffix}` });
    createdExclusionIds.push(exc.id);

    const [pkg] = await db
      .insert(packages)
      .values({
        id: ulid(),
        tenantId,
        providerId,
        productType: "umrah",
        title: "Package referencing exclusion",
        slug: `package-referencing-exclusion-${suffix}`,
      })
      .returning();
    createdPackageIds.push(pkg!.id);

    await db.insert(packageExclusions).values({
      packageId: pkg!.id,
      exclusionId: exc.id,
    });

    await expect(service.remove(exc.id)).rejects.toBeInstanceOf(ConflictException);

    const stillExists = await service.findById(exc.id);
    expect(stillExists).toBeDefined();
  });
});
