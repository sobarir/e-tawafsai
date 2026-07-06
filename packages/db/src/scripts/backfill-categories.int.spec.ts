/**
 * Integration spec for the one-time package-category backfill script.
 * Requires DATABASE_URL + a seeded default tenant. Run with:
 *   bunx vitest run src/scripts/backfill-categories.int.spec.ts
 */
import { config } from "dotenv";
import { resolve } from "node:path";
import { ulid } from "ulid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { createDb, type Database } from "../index";
import { tenants, providers, packages, packageCategories } from "../schema";
import { backfillCategories } from "./backfill-categories";
import { DEFAULT_TENANT_SLUG, LEGACY_CATEGORY_NAMES } from "@cometkit/shared";

config({ path: resolve(__dirname, "../../../../.env") });

describe("backfillCategories (integration)", () => {
  let db: Database;
  let tenantId: string;
  let providerId: string;
  const packageIds: string[] = [];
  const suffix = ulid().toLowerCase();

  beforeAll(async () => {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL required");
    db = createDb(url);
    const [t] = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, DEFAULT_TENANT_SLUG));
    if (!t) throw new Error("Default tenant not seeded - run bun run db:seed first");
    tenantId = t.id;

    providerId = ulid();
    await db.insert(providers).values({
      id: providerId,
      tenantId,
      name: `Backfill Provider ${suffix}`,
      brandName: "Backfill Brand",
      contactPerson: "Contact",
      contactPhone: "628",
      accreditation: "unknown",
      defaultCommissionType: "flat_per_pax",
      defaultCommissionValue: 500000,
    });

    const pkgIdA = ulid();
    const pkgIdB = ulid();
    packageIds.push(pkgIdA, pkgIdB);
    await db.insert(packages).values([
      {
        id: pkgIdA,
        tenantId,
        providerId,
        productType: "umrah",
        title: `Backfill Package A ${suffix}`,
        slug: `backfill-package-a-${suffix}`,
        category: "regular",
      },
      {
        id: pkgIdB,
        tenantId,
        providerId,
        productType: "umrah",
        title: `Backfill Package B ${suffix}`,
        slug: `backfill-package-b-${suffix}`,
        category: "regular",
      },
    ]);
  });

  afterAll(async () => {
    if (packageIds.length) await db.delete(packages).where(inArray(packages.id, packageIds));
    await db.delete(packageCategories).where(eq(packageCategories.providerId, providerId));
    await db.delete(providers).where(eq(providers.id, providerId));
  });

  it("creates a category from the legacy enum value, seeded from the provider default, and repoints packages", async () => {
    await backfillCategories(db);

    const [category] = await db
      .select({
        id: packageCategories.id,
        name: packageCategories.name,
        productType: packageCategories.productType,
        commissionType: packageCategories.commissionType,
        commissionValue: packageCategories.commissionValue,
      })
      .from(packageCategories)
      .where(
        and(
          eq(packageCategories.providerId, providerId),
          eq(packageCategories.productType, "umrah"),
          eq(packageCategories.name, "Regular"),
        ),
      );

    expect(category).toBeDefined();
    expect(category?.commissionType).toBe("flat_per_pax");
    expect(category?.commissionValue).toBe(500000);

    const repointedPackages = await db
      .select({ id: packages.id, categoryId: packages.categoryId })
      .from(packages)
      .where(inArray(packages.id, packageIds));

    expect(repointedPackages).toHaveLength(2);
    for (const pkg of repointedPackages) {
      expect(pkg.categoryId).toBe(category?.id);
    }
  });

  it("seeds all six legacy category names for the provider under umrah", async () => {
    await backfillCategories(db);

    const rows = await db
      .select({ name: packageCategories.name })
      .from(packageCategories)
      .where(and(eq(packageCategories.providerId, providerId), eq(packageCategories.productType, "umrah")));

    const names = rows.map((r) => r.name).sort();
    expect(names).toEqual([...LEGACY_CATEGORY_NAMES].sort());
  });

  it("is a no-op on re-run (identical counts, no duplicate rows, no null category_id remains)", async () => {
    await backfillCategories(db);

    const beforeRows = await db
      .select({ id: packageCategories.id })
      .from(packageCategories)
      .where(and(eq(packageCategories.providerId, providerId), eq(packageCategories.productType, "umrah")));
    expect(beforeRows).toHaveLength(6);

    const result = await backfillCategories(db);
    expect(result).toEqual({ created: 0, repointed: 0 });

    const afterRows = await db
      .select({ id: packageCategories.id })
      .from(packageCategories)
      .where(and(eq(packageCategories.providerId, providerId), eq(packageCategories.productType, "umrah")));
    expect(afterRows).toHaveLength(6);

    const stillNull = await db
      .select({ id: packages.id })
      .from(packages)
      .where(and(inArray(packages.id, packageIds), isNull(packages.categoryId)));
    expect(stillNull).toHaveLength(0);
  });
});
