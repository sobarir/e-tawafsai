/**
 * Integration spec - exercises UsersService against the real database.
 * Requires DATABASE_URL (repo-root .env). Run with: bun run test:int
 */
import { ForbiddenException } from "@nestjs/common";
import { config } from "dotenv";
import { resolve } from "node:path";
import { ulid } from "ulid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ClsService } from "nestjs-cls";
import { createDb, tenants, users, type Database } from "@cometkit/db";
import { eq, inArray } from "drizzle-orm";
import { DEFAULT_TENANT_SLUG, type AuthUser } from "@cometkit/shared";
import { TenantScopedDb } from "../tenancy/tenant-scoped-db";
import { UsersService } from "./users.service";

config({ path: resolve(__dirname, "../../../../.env") });

const noopLogger = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
} as never;

describe("UsersService (integration)", () => {
  let db: Database;
  let service: UsersService;
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
    service = new UsersService(scoped, noopLogger);
  });

  afterAll(async () => {
    if (createdIds.length > 0) {
      await db.delete(users).where(inArray(users.id, createdIds));
    }
  });

  it("creates, lists, updates role, and refuses self-deactivate", async () => {
    const created = await service.createUser({
      email: `int-${suffix}@cometkit.dev`,
      password: "password123",
      role: "staff",
      waNumber: "12345",
    });
    createdIds.push(created.id);
    expect(created.id).toHaveLength(26);
    expect(created.role).toBe("staff");
    expect(created.waNumber).toBe("12345");
    expect(created.isActive).toBe(true);

    const page = await service.list({ page: 1, limit: 100 });
    expect(page.data.some((u) => u.id === created.id)).toBe(true);
    expect(page.meta.total).toBeGreaterThanOrEqual(1);

    const promoted = await service.updateUser(created.id, { role: "admin" });
    expect(promoted.role).toBe("admin");

    const actor: AuthUser = {
      id: created.id,
      email: created.email,
      name: null,
      role: "admin",
      tenantId: (await service.findById(created.id))!.tenantId,
    };
    await expect(service.deactivateUser(actor, created.id)).rejects.toBeInstanceOf(
      ForbiddenException,
    );

    const adminActor: AuthUser = {
      id: "01ADMINAAAAAAAAAAAAAAAAAAA",
      email: "admin-test@cometkit.dev",
      name: "Test Admin",
      role: "admin",
      tenantId: actor.tenantId,
    };
    const deactivated = await service.deactivateUser(adminActor, created.id);
    expect(deactivated.isActive).toBe(false);

    const reactivated = await service.reactivateUser(created.id);
    expect(reactivated.isActive).toBe(true);
  });
});
