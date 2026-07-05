/**
 * Integration spec for the per-tenant provider unique indexes.
 * Requires DATABASE_URL + a seeded default tenant. Run with: bun run test:int
 */
import { config } from "dotenv";
import { resolve } from "node:path";
import { ulid } from "ulid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { createDb, tenants, providers, type Database } from "@cometkit/db";
import { DEFAULT_TENANT_SLUG } from "@cometkit/shared";

config({ path: resolve(__dirname, "../../../../.env") });

describe("provider unique indexes (integration)", () => {
  let db: Database;
  let tenantId: string;
  const ids: string[] = [];
  const suffix = ulid().toLowerCase();
  const base = () => ({
    tenantId,
    brandName: "b",
    contactPerson: "c",
    contactPhone: "628",
    accreditation: "unknown" as const,
    defaultCommissionType: "flat_per_pax" as const,
  });

  beforeAll(async () => {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL required");
    db = createDb(url);
    const [t] = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, DEFAULT_TENANT_SLUG));
    if (!t) throw new Error("Default tenant not seeded - run bun run db:seed first");
    tenantId = t.id;
  });
  afterAll(async () => {
    if (ids.length) await db.delete(providers).where(inArray(providers.id, ids));
  });

  it("rejects a direct duplicate normalized-name insert", async () => {
    const a = ulid();
    ids.push(a);
    await db.insert(providers).values({ ...base(), id: a, name: `Idx ${suffix}` });

    const b = ulid();
    ids.push(b);
    // Drizzle wraps the driver error; the SQLSTATE sits on the cause.
    await expect(
      db.insert(providers).values({ ...base(), id: b, name: ` idx ${suffix} ` }),
    ).rejects.toMatchObject({ cause: { code: "23505" } });
  });

  it("allows multiple null-PPIU rows (blank PPIUs do not collide)", async () => {
    const a = ulid();
    const b = ulid();
    ids.push(a, b);
    await db.insert(providers).values({ ...base(), id: a, name: `Blank1 ${suffix}`, ppiuLicenseNo: null });
    await expect(
      db.insert(providers).values({ ...base(), id: b, name: `Blank2 ${suffix}`, ppiuLicenseNo: null }),
    ).resolves.toBeDefined();
  });
});
