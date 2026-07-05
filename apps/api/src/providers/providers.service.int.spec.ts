/**
 * Integration spec - exercises ProvidersService against the real database.
 * Requires DATABASE_URL (repo-root .env). Run with: bun run test:int
 */
import { BadRequestException } from "@nestjs/common";
import { config } from "dotenv";
import { resolve } from "node:path";
import { ulid } from "ulid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ClsService } from "nestjs-cls";
import { createDb, tenants, providers, type Database } from "@cometkit/db";
import { eq, inArray } from "drizzle-orm";
import { DEFAULT_TENANT_SLUG } from "@cometkit/shared";
import { TenantScopedDb } from "../tenancy/tenant-scoped-db";
import { ProvidersService } from "./providers.service";

config({ path: resolve(__dirname, "../../../../.env") });

const noopLogger = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
} as never;

describe("ProvidersService (integration)", () => {
  let db: Database;
  let service: ProvidersService;
  const createdIds: string[] = [];
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
    const cls = { get: () => tenant.id } as unknown as ClsService;
    const scoped = new TenantScopedDb(db, cls);
    service = new ProvidersService(scoped, noopLogger, {
      getAffectedPackages: async () => [],
      unpublishPackages: async () => {},
    });
  });

  afterAll(async () => {
    if (createdIds.length > 0) {
      await db.delete(providers).where(inArray(providers.id, createdIds));
    }
  });

  it("creates, lists, updates, activates, and deactivates a provider", async () => {
    // 1. Create Draft
    const created = await service.create({
      name: `PT. Al-Amin Integration ${suffix}`,
      brandName: "Al-Amin",
      contactPerson: "Budi",
      contactPhone: "62812345678",
      accreditation: "A",
      defaultCommissionType: "flat_per_pax",
      defaultCommissionValue: 500000,
    });
    createdIds.push(created.id);
    expect(created.id).toHaveLength(26);
    expect(created.isActive).toBe(false); // draft defaults to inactive

    // 2. Try activating without consent -> should fail
    await expect(
      service.activate(created.id, { ppiuLicenseNo: null, pihkLicenseNo: null, consentConfirmed: false })
    ).rejects.toBeInstanceOf(BadRequestException);

    // 3. Try activating with consent but no license -> should fail
    await expect(
      service.activate(created.id, { ppiuLicenseNo: null, pihkLicenseNo: null, consentConfirmed: true })
    ).rejects.toBeInstanceOf(BadRequestException);

    // 4. Activate successfully
    const activated = await service.activate(created.id, {
      ppiuLicenseNo: "PPIU-999",
      pihkLicenseNo: null,
      consentConfirmed: true,
    });
    expect(activated.isActive).toBe(true);
    expect(activated.ppiuLicenseNo).toBe("PPIU-999");
    expect(activated.pricePublicationConsentAt).not.toBeNull();

    // 5. Deactivate
    const deactivated = await service.deactivate(created.id);
    expect(deactivated.provider.isActive).toBe(false);
    expect(deactivated.affectedPackages).toEqual([]);
  });
});
