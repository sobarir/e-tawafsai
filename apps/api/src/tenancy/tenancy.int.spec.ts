// apps/api/src/tenancy/tenancy.int.spec.ts
import { config } from "dotenv";
import { resolve } from "node:path";
import { ulid } from "ulid";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import { createDb, tenants, users, type Database } from "@cometkit/db";
import { tenantInputSchema } from "@cometkit/shared";
import { TenantScopedDb } from "./tenant-scoped-db";
import { TenantContextMissingError } from "./tenant-context";

config({ path: resolve(__dirname, "../../../../.env") });

function clsStub(tenantId: string | undefined) {
  return { get: vi.fn().mockReturnValue(tenantId), set: vi.fn() } as never;
}

describe("tenant isolation (integration)", () => {
  let db: Database;
  const suffix = ulid().toLowerCase();
  const tenantIds: string[] = [];
  const email = `iso-${suffix}@cometkit.dev`; // identical email in both tenants

  beforeAll(async () => {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL required for integration tests");
    db = createDb(url);
    for (const slug of [`iso-a-${suffix}`, `iso-b-${suffix}`]) {
      const input = tenantInputSchema.parse({
        name: slug, slug, tenantType: "agent", plan: "subscription",
        planStatus: "active", brandName: slug,
      });
      const id = ulid();
      await db.insert(tenants).values({ id, ...input });
      tenantIds.push(id);
      // Each tenant gets a user with the SAME email — proves per-tenant uniqueness.
      const scoped = new TenantScopedDb(db, clsStub(id));
      await scoped.insertValues(users, {
        email, passwordHash: "x", name: slug, role: "staff",
      });
    }
  });

  afterAll(async () => {
    await db.delete(users).where(inArray(users.tenantId, tenantIds));
    await db.delete(tenants).where(inArray(tenants.id, tenantIds));
  });

  it("returns only the active tenant's rows, zero foreign tenantId", async () => {
    const scopedA = new TenantScopedDb(db, clsStub(tenantIds[0]));
    const rows = await scopedA.select(users, eq(users.email, email));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.tenantId).toBe(tenantIds[0]);
    expect(rows.some((r) => r.tenantId === tenantIds[1])).toBe(false);
  });

  it("permits identical emails across tenants (composite uniqueness)", async () => {
    const both = await db.select().from(users).where(eq(users.email, email));
    expect(both).toHaveLength(2);
  });

  it("fails loudly when no tenant context is established", async () => {
    const unscoped = new TenantScopedDb(db, clsStub(undefined));
    expect(() => unscoped.select(users)).toThrow(TenantContextMissingError);
  });

  it("has exactly one default tenant seeded", async () => {
    const def = await db.select().from(tenants).where(eq(tenants.slug, "default"));
    expect(def).toHaveLength(1);
  });

  it("rejects a token whose tenantId no longer matches the user's tenant", async () => {
    const staleEmail = `stale-${suffix}@cometkit.dev`;
    const scopedA = new TenantScopedDb(db, clsStub(tenantIds[0]));
    await scopedA.insertValues(users, {
      email: staleEmail, passwordHash: "x", name: "stale", role: "staff",
    });
    const [created] = await db.select().from(users)
      .where(and(eq(users.tenantId, tenantIds[0]!), eq(users.email, staleEmail)));
    expect(created).toBeDefined();
    // User reassigned to tenant B; a token still claiming tenant A must not resolve them.
    await db.update(users).set({ tenantId: tenantIds[1]! }).where(eq(users.id, created!.id));
    const stillInA = await scopedA.select(users, eq(users.id, created!.id));
    expect(stillInA).toHaveLength(0);
  });
});
