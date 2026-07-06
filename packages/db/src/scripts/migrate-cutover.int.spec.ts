/**
 * Migration-safety integration spec for the category cutover (0016_late_venus).
 *
 * Guards the CRITICAL data-loss risk: on any database that already has package
 * rows carrying a legacy `category` enum value, migration 0016 must create a
 * `package_categories` row and repoint `packages.category_id` BEFORE it drops
 * the `category` column. This test executes the ACTUAL backfill SQL parsed from
 * 0016_late_venus.sql (steps 1-2 only, not the DROPs) against packages that
 * carry a legacy `category` value, and asserts every one is repointed to a
 * correctly-named category seeded from the provider's default commission.
 *
 * Because the shipped schema has already dropped the `category` column/type,
 * this spec reconstructs the pre-0016 state in setup (re-adds the enum type and
 * column), inserts packages that carry a legacy value with category_id NULL,
 * runs the migration's backfill statements verbatim, asserts, then tears the
 * reconstructed column/type back down so the DB is left in its post-0016 shape.
 *
 * Requires DATABASE_URL + a seeded default tenant (run db:migrate && db:seed).
 * Run with:
 *   bunx vitest run src/scripts/migrate-cutover.int.spec.ts
 */
import { config } from "dotenv";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ulid } from "ulid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, inArray, sql } from "drizzle-orm";
import { createDb, type Database } from "../index";
import { tenants, providers, packages, packageCategories } from "../schema";
import { DEFAULT_TENANT_SLUG } from "@cometkit/shared";

config({ path: resolve(__dirname, "../../../../.env") });

/** The two data-preservation statements (INSERT categories, UPDATE repoint)
 * from 0016 — parsed from the real .sql so the test exercises the shipped SQL,
 * not a copy. The remaining statements are the DROP COLUMN / DROP TYPE. */
function backfillStatements(): [string, string] {
  const sqlPath = resolve(__dirname, "../../drizzle/0016_late_venus.sql");
  const parts = readFileSync(sqlPath, "utf8")
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter(Boolean);
  const insertCategories = parts[0];
  const repointPackages = parts[1];
  if (!insertCategories?.startsWith("INSERT INTO \"package_categories\"")) {
    throw new Error("0016 statement 1 is not the package_categories INSERT — migration changed shape");
  }
  if (!repointPackages?.startsWith("UPDATE \"packages\"")) {
    throw new Error("0016 statement 2 is not the packages repoint UPDATE — migration changed shape");
  }
  return [insertCategories, repointPackages];
}

describe("category cutover migration 0016 (data safety, integration)", () => {
  let db: Database;
  let tenantId: string;
  let providerId: string;
  const packageIds: string[] = [];
  const suffix = ulid().toLowerCase();
  const commissionValue = 750000;

  beforeAll(async () => {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL required");
    db = createDb(url);

    const [t] = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, DEFAULT_TENANT_SLUG));
    if (!t) throw new Error("Default tenant not seeded - run bun run db:seed first");
    tenantId = t.id;

    // Reconstruct the pre-0016 state: the legacy `category` enum type + column.
    // Idempotent so the suite can be re-run.
    await db.execute(sql`ALTER TABLE "packages" DROP COLUMN IF EXISTS "category"`);
    await db.execute(sql`DROP TYPE IF EXISTS "category"`);
    await db.execute(
      sql`CREATE TYPE "category" AS ENUM ('regular', 'plus', 'private_vip', 'ramadan', 'arbain', 'other')`,
    );
    await db.execute(sql`ALTER TABLE "packages" ADD COLUMN "category" "category"`);

    providerId = ulid();
    await db.insert(providers).values({
      id: providerId,
      tenantId,
      name: `Cutover Provider ${suffix}`,
      brandName: "Cutover Brand",
      contactPerson: "Contact",
      contactPhone: "628",
      accreditation: "unknown",
      defaultCommissionType: "flat_per_pax",
      defaultCommissionValue: commissionValue,
    });

    // Two EXISTING packages carrying a legacy category value, category_id NULL.
    // Two distinct categories exercise DISTINCT ON and a multi-word display name.
    const pkgRegular = ulid();
    const pkgVip = ulid();
    packageIds.push(pkgRegular, pkgVip);
    await db.execute(sql`
      INSERT INTO "packages" ("id", "tenant_id", "provider_id", "product_type", "title", "slug", "category", "category_id")
      VALUES
        (${pkgRegular}, ${tenantId}, ${providerId}, 'umrah', ${`Cutover Regular ${suffix}`}, ${`cutover-regular-${suffix}`}, 'regular', NULL),
        (${pkgVip}, ${tenantId}, ${providerId}, 'umrah', ${`Cutover VIP ${suffix}`}, ${`cutover-vip-${suffix}`}, 'private_vip', NULL)
    `);
  });

  afterAll(async () => {
    if (packageIds.length) await db.delete(packages).where(inArray(packages.id, packageIds));
    if (providerId) {
      await db.delete(packageCategories).where(eq(packageCategories.providerId, providerId));
      await db.delete(providers).where(eq(providers.id, providerId));
    }
    // Restore the post-0016 shape: drop the reconstructed column + type.
    await db.execute(sql`ALTER TABLE "packages" DROP COLUMN IF EXISTS "category"`);
    await db.execute(sql`DROP TYPE IF EXISTS "category"`);
  });

  it("repoints every existing package to a correctly-named, provider-seeded category before the drops", async () => {
    const [insertCategories, repointPackages] = backfillStatements();

    // Execute the migration's data-preservation steps verbatim.
    await db.execute(sql.raw(insertCategories));
    await db.execute(sql.raw(repointPackages));

    // Every test package now points at a category (no data loss).
    const repointed = await db
      .select({ id: packages.id, categoryId: packages.categoryId })
      .from(packages)
      .where(inArray(packages.id, packageIds));
    expect(repointed).toHaveLength(2);
    for (const pkg of repointed) {
      expect(pkg.categoryId).not.toBeNull();
    }

    // The created categories carry the correct display name + provider commission.
    const cats = await db
      .select({
        id: packageCategories.id,
        name: packageCategories.name,
        productType: packageCategories.productType,
        commissionType: packageCategories.commissionType,
        commissionValue: packageCategories.commissionValue,
      })
      .from(packageCategories)
      .where(and(eq(packageCategories.tenantId, tenantId), eq(packageCategories.providerId, providerId)));
    const byName = new Map(cats.map((c) => [c.name, c]));

    const regular = byName.get("Regular");
    expect(regular).toBeDefined();
    expect(regular?.productType).toBe("umrah");
    expect(regular?.commissionType).toBe("flat_per_pax");
    expect(regular?.commissionValue).toBe(commissionValue);

    const vip = byName.get("Private VIP");
    expect(vip).toBeDefined();
    expect(vip?.productType).toBe("umrah");
    expect(vip?.commissionType).toBe("flat_per_pax");
    expect(vip?.commissionValue).toBe(commissionValue);

    // The 'regular' package points at "Regular", the 'private_vip' at "Private VIP".
    const [pkgRegularId, pkgVipId] = packageIds;
    const regularPkg = repointed.find((p) => p.id === pkgRegularId);
    const vipPkg = repointed.find((p) => p.id === pkgVipId);
    expect(regularPkg?.categoryId).toBe(regular?.id);
    expect(vipPkg?.categoryId).toBe(vip?.id);
  });

  it("is a no-op on re-run (idempotent): no new categories, no packages left unrepointed", async () => {
    const [insertCategories, repointPackages] = backfillStatements();

    const before = await db
      .select({ id: packageCategories.id })
      .from(packageCategories)
      .where(eq(packageCategories.providerId, providerId));

    await db.execute(sql.raw(insertCategories));
    await db.execute(sql.raw(repointPackages));

    const after = await db
      .select({ id: packageCategories.id })
      .from(packageCategories)
      .where(eq(packageCategories.providerId, providerId));
    expect(after).toHaveLength(before.length);

    const stillNull = await db
      .select({ id: packages.id })
      .from(packages)
      .where(and(inArray(packages.id, packageIds), sql`${packages.categoryId} IS NULL`));
    expect(stillNull).toHaveLength(0);
  });
});
