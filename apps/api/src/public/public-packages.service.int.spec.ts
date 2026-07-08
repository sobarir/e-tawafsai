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
  type Database,
} from "@cometkit/db";
import { eq, inArray } from "drizzle-orm";
import { DEFAULT_TENANT_SLUG } from "@cometkit/shared";
import { TenantScopedDb } from "../tenancy/tenant-scoped-db";
import { PublicPackagesService } from "./public-packages.service";

config({ path: resolve(__dirname, "../../../../.env") });

const noopLogger = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
} as never;

describe("PublicPackagesService (integration)", () => {
  let db: Database;
  let service: PublicPackagesService;
  let tenantId: string;
  const suffix = ulid().toLowerCase();
  const createdPackageIds: string[] = [];
  const createdProviderIds: string[] = [];
  const publishedSlug = `pub-published-${suffix}`;
  const draftSlug = `pub-draft-${suffix}`;

  beforeAll(async () => {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL required for integration tests");
    db = createDb(url);
    const [tenant] = await db.select().from(tenants).where(eq(tenants.slug, DEFAULT_TENANT_SLUG));
    if (!tenant) throw new Error("Default tenant not seeded - run bun run db:seed first");
    tenantId = tenant.id;
    const cls = { get: () => tenantId } as unknown as ClsService;
    service = new PublicPackagesService(new TenantScopedDb(db, cls), db, noopLogger);

    const providerId = ulid();
    await db.insert(providers).values({
      id: providerId,
      tenantId,
      name: `PT. Public Provider ${suffix}`,
      brandName: "Brand",
      ppiuLicenseNo: `PPIU-${suffix.slice(-6)}`,
      accreditation: "A",
      contactPerson: "Budi",
      contactPhone: "62812345678",
      isActive: true,
      pricePublicationConsentAt: new Date(),
    });
    createdProviderIds.push(providerId);

    const pubId = ulid();
    const draftId = ulid();
    await db.insert(packages).values([
      {
        id: pubId,
        tenantId,
        providerId,
        productType: "umrah",
        title: `Public Published ${suffix}`,
        slug: publishedSlug,
        status: "published",
      },
      {
        id: draftId,
        tenantId,
        providerId,
        productType: "umrah",
        title: `Public Draft ${suffix}`,
        slug: draftSlug,
        status: "draft",
      },
    ]);
    createdPackageIds.push(pubId, draftId);
  });

  afterAll(async () => {
    if (createdPackageIds.length) await db.delete(packages).where(inArray(packages.id, createdPackageIds));
    if (createdProviderIds.length) await db.delete(providers).where(inArray(providers.id, createdProviderIds));
  });

  it("returns the published package and excludes the draft", async () => {
    const result = await service.featured(50);
    const slugs = result.map((p) => p.slug);
    expect(slugs).toContain(publishedSlug);
    expect(slugs).not.toContain(draftSlug);
  });

  it("exposes only marketing-safe fields (no internal leakage)", async () => {
    const result = await service.featured(50);
    const card = result.find((p) => p.slug === publishedSlug);
    expect(card).toBeDefined();
    expect(Object.keys(card!).sort()).toEqual([
      "airline",
      "category",
      "hotels",
      "nearestDepartureDate",
      "seatsAvailable",
      "slug",
      "startingPriceIdr",
      "title",
    ]);
    // Spot-check that internal fields never appear on the wire shape.
    const asRecord = card as unknown as Record<string, unknown>;
    expect(asRecord.providerId).toBeUndefined();
    expect(asRecord.commissionValue).toBeUndefined();
    expect(asRecord.categoryId).toBeUndefined();
    expect(asRecord.status).toBeUndefined();
  });

  it("returns null price/date and 0 seats when a published package has no upcoming departure", async () => {
    const result = await service.featured(50);
    const card = result.find((p) => p.slug === publishedSlug)!;
    expect(card.nearestDepartureDate).toBeNull();
    expect(card.startingPriceIdr).toBeNull();
    expect(card.seatsAvailable).toBe(0);
  });
});
