import { config } from "dotenv";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ClsService } from "nestjs-cls";
import type { ConfigService } from "@nestjs/config";
import {
  createDb,
  tenants,
  providers,
  packages,
  packageHotels,
  hotels,
  departures,
  seedSearchBenchmark,
  type Database,
} from "@cometkit/db";
import { eq, inArray, sql } from "drizzle-orm";
import { DEFAULT_TENANT_SLUG } from "@cometkit/shared";
import { TenantScopedDb } from "../tenancy/tenant-scoped-db";
import { SearchService } from "./search.service";

config({ path: resolve(__dirname, "../../../../.env") });
const noopLogger = { info: () => undefined, warn: () => undefined, error: () => undefined } as never;
const configStub = { get: (_k: string, d?: string) => d ?? "etawafsai.com" } as unknown as ConfigService;

describe("SearchService benchmark (integration)", () => {
  let db: Database;
  let service: SearchService;
  let tenantId: string;
  let seeded: { providerId: string; packageIds: string[]; hotelIds: string[] };

  beforeAll(async () => {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL required for integration tests");
    db = createDb(url);
    const [tenant] = await db.select().from(tenants).where(eq(tenants.slug, DEFAULT_TENANT_SLUG));
    if (!tenant) throw new Error("Default tenant not seeded - run bun run db:seed first");
    tenantId = tenant.id;
    seeded = await seedSearchBenchmark(db, tenantId);
    await db.execute(sql`analyze packages`);
    await db.execute(sql`analyze departures`);
    const cls = { get: () => tenantId } as unknown as ClsService;
    service = new SearchService(new TenantScopedDb(db, cls), db, configStub, noopLogger);
  }, 120_000);

  afterAll(async () => {
    await db.delete(departures).where(inArray(departures.packageId, seeded.packageIds));
    await db.delete(packageHotels).where(inArray(packageHotels.packageId, seeded.packageIds));
    await db.delete(packages).where(inArray(packages.id, seeded.packageIds));
    await db.delete(hotels).where(inArray(hotels.id, seeded.hotelIds));
    await db.delete(providers).where(eq(providers.id, seeded.providerId));
  });

  it("meets the P95 < 500 ms budget across a standard filter set", async () => {
    const params = {
      occupancy: "quad", directOnly: false, seatsAvailableOnly: true,
      maxPrice: 30_000_000, durationMin: 9, durationMax: 13, monthFrom: "2026-09", monthTo: "2026-12",
      q: "umrah", page: 1, pageSize: 20,
    } as never;
    const timings: number[] = [];
    for (let i = 0; i < 20; i++) {
      const t = performance.now();
      await service.search(params);
      timings.push(performance.now() - t);
    }
    timings.sort((a, b) => a - b);
    const p95 = timings[Math.ceil(timings.length * 0.95) - 1]!;
    console.log("search P95 ms:", p95.toFixed(1));
    expect(p95).toBeLessThan(500);
  }, 60_000);

  it("EXPLAIN shows the departure lateral does not sequentially scan all departures", async () => {
    const plan = await db.execute(sql`
      explain (format json)
      select 1 from packages p
      join lateral (select 1 from departures d
        where d.package_id = p.id and d.tenant_id = p.tenant_id
          and d.status in ('open','almost_full')
          and d.departure_date >= '2026-09-01'::timestamptz
        order by d.departure_date asc limit 1) nd on true
      where p.tenant_id = ${tenantId} and p.status <> 'archived' limit 20`);
    const planText = JSON.stringify(plan);
    expect(planText).not.toMatch(/"Node Type":\s*"Seq Scan"[^}]*"Relation Name":\s*"departures"/);
  }, 60_000);
});
