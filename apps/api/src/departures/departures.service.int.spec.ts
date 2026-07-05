import { BadRequestException, ConflictException } from "@nestjs/common";
import { config } from "dotenv";
import { resolve } from "node:path";
import { ulid } from "ulid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ClsService } from "nestjs-cls";
import { createDb, tenants, providers, packages, departures, inventoryAdjustments, type Database } from "@cometkit/db";
import { eq, inArray } from "drizzle-orm";
import { DEFAULT_TENANT_SLUG } from "@cometkit/shared";
import { TenantScopedDb } from "../tenancy/tenant-scoped-db";
import { DeparturesService } from "./departures.service";
import { PackagesService } from "../packages/packages.service";

config({ path: resolve(__dirname, "../../../../.env") });

const noopLogger = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
} as never;

describe("DeparturesService (integration)", () => {
  let db: Database;
  let service: DeparturesService;
  let packagesService: PackagesService;
  let tenantId: string;
  let packageId: string;
  let providerId: string;
  const createdDepartureIds: string[] = [];
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
    if (!tenant) throw new Error("Default tenant not seeded");
    tenantId = tenant.id;

    // Create a provider
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
    createdProviderIds.push(pId);

    // Create a package
    const pkgId = ulid();
    await db.insert(packages).values({
      id: pkgId,
      tenantId,
      providerId: pId,
      productType: "umrah",
      title: `Umrah Package ${suffix}`,
      slug: `umrah-package-${suffix}`,
      category: "regular",
      status: "draft",
      hasBeenPublished: false,
    });
    packageId = pkgId;
    createdPackageIds.push(pkgId);

    providerId = pId;

    const cls = { get: () => tenantId } as unknown as ClsService;
    const scoped = new TenantScopedDb(db, cls);
    service = new DeparturesService(scoped, db, noopLogger);
    packagesService = new PackagesService(scoped, db, noopLogger);
  });

  afterAll(async () => {
    if (createdDepartureIds.length > 0) {
      await db.delete(inventoryAdjustments).where(inArray(inventoryAdjustments.departureId, createdDepartureIds));
      await db.delete(departures).where(inArray(departures.id, createdDepartureIds));
    }
    if (createdPackageIds.length > 0) {
      await db.delete(packages).where(inArray(packages.id, createdPackageIds));
    }
    if (createdProviderIds.length > 0) {
      await db.delete(providers).where(inArray(providers.id, createdProviderIds));
    }
  });

  it("creates a departure under a package", async () => {
    const dep = await service.create({
      packageId,
      departureType: "fixed_date",
      departureDate: new Date("2026-08-15T00:00:00.000Z").toISOString(),
      returnDate: new Date("2026-08-24T00:00:00.000Z").toISOString(),
      seatTotal: 45,
      currency: "IDR",
      priceQuad: 35000000,
      dpAmount: 5000000,
      paymentSchedule: [
        { name: "DP", amount: 5000000, daysBeforeDeparture: 60 }
      ],
    });
    expect(dep.id).toBeDefined();
    createdDepartureIds.push(dep.id);
  });

  it("rejects estimated_year departures", async () => {
    await expect(
      service.create({
        packageId,
        departureType: "estimated_year",
        departureDate: new Date("2026-08-15T00:00:00.000Z").toISOString(),
        returnDate: new Date("2026-08-24T00:00:00.000Z").toISOString(),
        seatTotal: 45,
        currency: "IDR",
        priceQuad: 35000000,
        dpAmount: 5000000,
        paymentSchedule: [
          { name: "DP", amount: 5000000, daysBeforeDeparture: 60 }
        ],
      })
    ).rejects.toThrow(BadRequestException);
  });

  it("performs transactional concurrency-safe seat updates", async () => {
    const dep = await service.create({
      packageId,
      departureType: "fixed_date",
      departureDate: new Date("2026-08-15T00:00:00.000Z").toISOString(),
      returnDate: new Date("2026-08-24T00:00:00.000Z").toISOString(),
      seatTotal: 1,
      currency: "IDR",
      priceQuad: 35000000,
      dpAmount: 5000000,
      paymentSchedule: [
        { name: "DP", amount: 5000000, daysBeforeDeparture: 60 }
      ],
    });
    createdDepartureIds.push(dep.id);

    // Book 1 seat (should succeed)
    await service.mutateSeats(dep.id, { deltaBooked: 1 });

    // Try booking another seat (should fail because remaining capacity is 0)
    await expect(
      service.mutateSeats(dep.id, { deltaBooked: 1 })
    ).rejects.toThrow(ConflictException);
  });

  it("rejects manual seat adjustments without note", async () => {
    const dep = await service.create({
      packageId,
      departureType: "fixed_date",
      departureDate: new Date("2026-08-15T00:00:00.000Z").toISOString(),
      returnDate: new Date("2026-08-24T00:00:00.000Z").toISOString(),
      seatTotal: 45,
      currency: "IDR",
      priceQuad: 35000000,
      dpAmount: 5000000,
      paymentSchedule: [
        { name: "DP", amount: 5000000, daysBeforeDeparture: 60 }
      ],
    });
    createdDepartureIds.push(dep.id);

    await expect(
      service.adjustInventory(dep.id, { delta: 5, reason: "" }, "test-actor")
    ).rejects.toThrow(BadRequestException);
  });

  it("records inventory audit logs on adjustments", async () => {
    const dep = await service.create({
      packageId,
      departureType: "fixed_date",
      departureDate: new Date("2026-08-15T00:00:00.000Z").toISOString(),
      returnDate: new Date("2026-08-24T00:00:00.000Z").toISOString(),
      seatTotal: 45,
      currency: "IDR",
      priceQuad: 35000000,
      dpAmount: 5000000,
      paymentSchedule: [
        { name: "DP", amount: 5000000, daysBeforeDeparture: 60 }
      ],
    });
    createdDepartureIds.push(dep.id);

    await service.adjustInventory(dep.id, { delta: 5, reason: "allotment increase" }, "test-actor");

    const [updated] = await db.select().from(departures).where(eq(departures.id, dep.id)).limit(1);
    expect(updated?.seatTotal).toBe(50);

    const adjustments = await db.select().from(inventoryAdjustments).where(eq(inventoryAdjustments.departureId, dep.id));
    expect(adjustments.length).toBe(1);
    expect(adjustments[0]?.delta).toBe(5);
    expect(adjustments[0]?.reason).toBe("allotment increase");
  });

  it("calculates package needsReview flag based on departure statuses", async () => {
    // 1. Create a published package
    const pkgId = ulid();
    await db.insert(packages).values({
      id: pkgId,
      tenantId,
      providerId,
      productType: "umrah",
      title: `Needs Review Package`,
      slug: `needs-review-${suffix}`,
      category: "regular",
      status: "published",
      hasBeenPublished: true,
    });
    createdPackageIds.push(pkgId);

    // 2. Add an open departure (should not need review yet)
    const dep1 = await service.create({
      packageId: pkgId,
      departureType: "fixed_date",
      departureDate: new Date("2026-09-15T00:00:00.000Z").toISOString(),
      returnDate: new Date("2026-09-24T00:00:00.000Z").toISOString(),
      seatTotal: 45,
      currency: "IDR",
      priceQuad: 35000000,
      dpAmount: 5000000,
      paymentSchedule: [
        { name: "DP", amount: 5000000, daysBeforeDeparture: 60 }
      ],
    });
    createdDepartureIds.push(dep1.id);

    // Query package status - should be false
    const res1 = await packagesService.findOne(pkgId);
    expect(res1.needsReview).toBe(false);

    // 3. Update departure status to full
    await service.mutateSeats(dep1.id, { deltaBooked: 45 });

    // Query package status - should be true now that all departures are full
    const res2 = await packagesService.findOne(pkgId);
    expect(res2.needsReview).toBe(true);
  });
});
