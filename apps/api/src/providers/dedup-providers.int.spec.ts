/**
 * Integration spec for the one-time provider dedup script.
 * Requires DATABASE_URL + a seeded default tenant. Run with: bun run test:int
 *
 * The unique indexes forbid inserting real duplicate rows, so this spec
 * exercises applyProviderMerges with DISTINCT rows plus a hand-built plan
 * (repoint/delete mechanics) and blank-PPIU normalization separately. The
 * clustering logic itself is unit-covered in packages/shared.
 */
import { config } from "dotenv";
import { resolve } from "node:path";
import { ulid } from "ulid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import {
  createDb,
  tenants,
  providers,
  packages,
  applyProviderMerges,
  dedupeProviders,
  type Database,
} from "@cometkit/db";
import { DEFAULT_TENANT_SLUG } from "@cometkit/shared";

config({ path: resolve(__dirname, "../../../../.env") });

describe("dedupeProviders (integration)", () => {
  let db: Database;
  let tenantId: string;
  const providerIds: string[] = [];
  const packageIds: string[] = [];
  const suffix = ulid().toLowerCase();

  beforeAll(async () => {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL required");
    db = createDb(url);
    const [t] = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, DEFAULT_TENANT_SLUG));
    if (!t) throw new Error("Default tenant not seeded - run bun run db:seed first");
    tenantId = t.id;
  });

  afterAll(async () => {
    if (packageIds.length) await db.delete(packages).where(inArray(packages.id, packageIds));
    if (providerIds.length) await db.delete(providers).where(inArray(providers.id, providerIds));
  });

  it("repoints packages and deletes losers for a hand-built plan", async () => {
    const survivor = ulid();
    const loser = ulid();
    providerIds.push(survivor, loser);
    const baseProv = {
      tenantId,
      brandName: "b",
      contactPerson: "c",
      contactPhone: "628",
      accreditation: "unknown" as const,
      defaultCommissionType: "flat_per_pax" as const,
    };
    await db.insert(providers).values([
      { ...baseProv, id: survivor, name: `Survivor ${suffix}` },
      { ...baseProv, id: loser, name: `Loser ${suffix}` },
    ]);
    const pkgId = ulid();
    packageIds.push(pkgId);
    await db.insert(packages).values({
      id: pkgId,
      tenantId,
      providerId: loser,
      title: `P ${suffix}`,
      slug: `p-${suffix}`,
    });

    const res = await applyProviderMerges(db, [{ survivorId: survivor, loserIds: [loser] }]);
    expect(res).toEqual({ repointed: 1, deleted: 1 });

    const [pkg] = await db
      .select({ providerId: packages.providerId })
      .from(packages)
      .where(eq(packages.id, pkgId));
    expect(pkg?.providerId).toBe(survivor); // repointed

    const remaining = await db
      .select({ id: providers.id })
      .from(providers)
      .where(inArray(providers.id, [survivor, loser]));
    expect(remaining.map((r) => r.id)).toEqual([survivor]); // loser deleted
  });

  it("normalizes a blank PPIU to null", async () => {
    const id = ulid();
    providerIds.push(id);
    await db.insert(providers).values({
      tenantId,
      id,
      name: `Blank ${suffix}`,
      brandName: "b",
      contactPerson: "c",
      contactPhone: "628",
      accreditation: "unknown",
      defaultCommissionType: "flat_per_pax",
      ppiuLicenseNo: "   ",
    });
    await dedupeProviders(db);
    const [row] = await db
      .select({ ppiu: providers.ppiuLicenseNo })
      .from(providers)
      .where(eq(providers.id, id));
    expect(row?.ppiu).toBeNull();
  });
});
