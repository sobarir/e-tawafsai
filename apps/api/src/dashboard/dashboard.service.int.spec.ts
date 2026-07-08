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
  departures,
  type Database,
} from "@cometkit/db";
import { eq, inArray } from "drizzle-orm";
import { DEFAULT_TENANT_SLUG } from "@cometkit/shared";
import { TenantScopedDb } from "../tenancy/tenant-scoped-db";
import { DashboardService } from "./dashboard.service";

config({ path: resolve(__dirname, "../../../../.env") });

const noopLogger = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
} as never;

function daysFromNow(n: number): Date {
  return new Date(Date.now() + n * 24 * 60 * 60 * 1000);
}

describe("DashboardService (integration)", () => {
  let db: Database;
  let serviceT2: DashboardService;
  let serviceDefault: DashboardService;
  const suffix = ulid().toLowerCase();
  const t2Id = ulid();
  const t2ProviderId = ulid();
  const t2PackageId = ulid();
  const nearDepartureId = ulid();
  const farDepartureId = ulid();
  const t2Title = `T2 Published ${suffix}`;

  beforeAll(async () => {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL required for integration tests");
    db = createDb(url);

    const [defaultTenant] = await db
      .select()
      .from(tenants)
      .where(eq(tenants.slug, DEFAULT_TENANT_SLUG));
    if (!defaultTenant) throw new Error("Default tenant not seeded - run bun run db:seed first");
    serviceDefault = new DashboardService(
      new TenantScopedDb(db, { get: () => defaultTenant.id } as unknown as ClsService),
      db,
      noopLogger,
    );
    serviceT2 = new DashboardService(
      new TenantScopedDb(db, { get: () => t2Id } as unknown as ClsService),
      db,
      noopLogger,
    );

    // Isolated second tenant with its own provider, published package, and departures.
    await db.insert(tenants).values({
      id: t2Id,
      name: `Tenant Two ${suffix}`,
      slug: `t2-${suffix}`.slice(0, 63),
      brandName: "T2 Brand",
    });
    await db.insert(providers).values({
      id: t2ProviderId,
      tenantId: t2Id,
      name: `PT. T2 Provider ${suffix}`,
      brandName: "Brand",
      ppiuLicenseNo: `PPIU-${suffix.slice(-6)}`,
      accreditation: "A",
      contactPerson: "Budi",
      contactPhone: "62812345678",
      isActive: true,
      pricePublicationConsentAt: new Date(),
    });
    await db.insert(packages).values({
      id: t2PackageId,
      tenantId: t2Id,
      providerId: t2ProviderId,
      productType: "umrah",
      title: t2Title,
      slug: `t2-pkg-${suffix}`,
      status: "published",
    });
    await db.insert(departures).values([
      {
        id: nearDepartureId,
        tenantId: t2Id,
        packageId: t2PackageId,
        departureDate: daysFromNow(10),
        returnDate: daysFromNow(19),
        seatTotal: 40,
        priceQuad: 30000000,
        dpAmount: 5000000,
        paymentSchedule: "[]",
        status: "open",
      },
      {
        id: farDepartureId,
        tenantId: t2Id,
        packageId: t2PackageId,
        departureDate: daysFromNow(60),
        returnDate: daysFromNow(69),
        seatTotal: 40,
        priceQuad: 30000000,
        dpAmount: 5000000,
        paymentSchedule: "[]",
        status: "open",
      },
    ]);
  });

  afterAll(async () => {
    await db.delete(departures).where(inArray(departures.id, [nearDepartureId, farDepartureId]));
    await db.delete(packages).where(eq(packages.id, t2PackageId));
    await db.delete(providers).where(eq(providers.id, t2ProviderId));
    await db.delete(tenants).where(eq(tenants.id, t2Id));
  });

  it("reports the tenant's own counts and recent package", async () => {
    const summary = await serviceT2!.summary();
    expect(summary.packages.published).toBeGreaterThanOrEqual(1);
    expect(summary.recentPackages.map((p) => p.title)).toContain(t2Title);
  });

  it("includes only within-45-day departures in needs-push", async () => {
    const summary = await serviceT2!.summary();
    const ids = summary.needsPush.map((d) => d.departureId);
    expect(ids).toContain(nearDepartureId);
    expect(ids).not.toContain(farDepartureId);
    const near = summary.needsPush.find((d) => d.departureId === nearDepartureId)!;
    expect(near.daysUntil).toBeGreaterThan(0);
    expect(near.seatsLeft).toBe(40);
  });

  it("does not leak another tenant's rows into the default tenant summary", async () => {
    const summary = await serviceDefault.summary();
    expect(summary.recentPackages.map((p) => p.title)).not.toContain(t2Title);
    expect(summary.needsPush.map((d) => d.departureId)).not.toContain(nearDepartureId);
  });
});
