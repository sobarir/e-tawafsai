import { config } from "dotenv";
import { resolve } from "node:path";
import { ulid } from "ulid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ClsService } from "nestjs-cls";
import type { ConfigService } from "@nestjs/config";
import { createDb, tenants, providers, packages, packageHotels, departures, type Database } from "@cometkit/db";
import { eq, inArray } from "drizzle-orm";
import { DEFAULT_TENANT_SLUG } from "@cometkit/shared";
import { TenantScopedDb } from "../tenancy/tenant-scoped-db";
import { SearchService } from "./search.service";

config({ path: resolve(__dirname, "../../../../.env") });

const noopLogger = { info: () => undefined, warn: () => undefined, error: () => undefined } as never;
const configStub = { get: (_k: string, d?: string) => d ?? "etawafsai.com" } as unknown as ConfigService;

describe("SearchService (integration)", () => {
  let db: Database;
  let service: SearchService;
  let tenantId: string;
  let providerId: string;
  const suffix = ulid().toLowerCase();
  const pkgIds: string[] = [];

  // Every search is scoped to this run's provider so assertions are isolated
  // from any demo seed data in the default tenant.
  function makeParams(partial: Record<string, unknown>) {
    return {
      occupancy: "quad",
      directOnly: false,
      seatsAvailableOnly: false,
      page: 1,
      pageSize: 50,
      providerId,
      ...partial,
    } as never;
  }

  async function seedPackage(opts: {
    title: string;
    directOnly?: boolean;
    duration?: number;
    hotelName?: string;
    depDate: Date;
    status?: "open" | "almost_full" | "full" | "departed" | "cancelled";
    priceQuad?: number;
    priceTriple?: number | null;
    seatBooked?: number;
  }): Promise<string> {
    const id = ulid();
    pkgIds.push(id);
    await db.insert(packages).values({
      id,
      tenantId,
      providerId,
      productType: "umrah",
      title: opts.title,
      slug: `${opts.title.toLowerCase().replace(/\s+/g, "-")}-${suffix}`,
      category: "regular",
      durationDays: opts.duration ?? 9,
      description: "paket",
      airline: "Saudia",
      departureCity: "Jakarta",
      directOnly: opts.directOnly ?? false,
      status: "published",
      hasBeenPublished: true,
    });
    if (opts.hotelName) {
      await db.insert(packageHotels).values({
        id: ulid(), packageId: id, cityName: "Makkah", name: opts.hotelName, stars: 5, distanceM: 150, isPelataran: false,
      });
    }
    await db.insert(departures).values({
      id: ulid(), tenantId, packageId: id, departureType: "fixed_date",
      departureDate: opts.depDate, returnDate: new Date(opts.depDate.getTime() + 9 * 86400000),
      seatTotal: 45, seatBooked: opts.seatBooked ?? 10, seatHeld: 0, currency: "IDR",
      priceQuad: opts.priceQuad ?? 28_000_000,
      priceTriple: opts.priceTriple === undefined ? 30_000_000 : opts.priceTriple,
      priceDouble: 33_000_000,
      dpAmount: 5_000_000,
      paymentSchedule: JSON.stringify([{ name: "DP", amount: 5_000_000, daysBeforeDeparture: 60 }]),
      status: opts.status ?? "open",
    });
    return id;
  }

  beforeAll(async () => {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL required for integration tests");
    db = createDb(url);
    const [tenant] = await db.select().from(tenants).where(eq(tenants.slug, DEFAULT_TENANT_SLUG));
    if (!tenant) throw new Error("Default tenant not seeded - run bun run db:seed first");
    tenantId = tenant.id;
    providerId = ulid();
    await db.insert(providers).values({
      id: providerId, tenantId, name: `PT Search ${suffix}`, brandName: "Search Travel",
      ppiuLicenseNo: "U.123 TAHUN 2024", accreditation: "A", contactPerson: "X", contactPhone: "62800", isActive: true,
      pricePublicationConsentAt: new Date(),
    });
    const cls = { get: () => tenantId } as unknown as ClsService;
    service = new SearchService(new TenantScopedDb(db, cls), db, configStub, noopLogger);
  });

  afterAll(async () => {
    if (pkgIds.length) {
      await db.delete(departures).where(inArray(departures.packageId, pkgIds));
      await db.delete(packageHotels).where(inArray(packageHotels.packageId, pkgIds));
      await db.delete(packages).where(inArray(packages.id, pkgIds));
    }
    await db.delete(providers).where(eq(providers.id, providerId));
  });

  it("matches a hotel-name fragment and excludes unrelated packages", async () => {
    const hit = await seedPackage({ title: `HotelHit ${suffix}`, hotelName: `Zamzam Tower ${suffix}`, depDate: new Date(Date.UTC(2026, 8, 12)) });
    await seedPackage({ title: `HotelMiss ${suffix}`, hotelName: `Generic Inn ${suffix}`, depDate: new Date(Date.UTC(2026, 8, 12)) });
    const res = await service.search(makeParams({ q: `Zamzam Tower ${suffix}` }));
    const ids = res.data.map((r) => r.id);
    expect(ids).toContain(hit);
    expect(ids).toHaveLength(1);
    expect(res.data[0]!.hotels.some((h) => h.name.includes("Zamzam"))).toBe(true);
  });

  it("returns only direct-only packages when the toggle is on", async () => {
    const direct = await seedPackage({ title: `DirectYes ${suffix}`, directOnly: true, depDate: new Date(Date.UTC(2026, 8, 12)) });
    const notDirect = await seedPackage({ title: `DirectNo ${suffix}`, directOnly: false, depDate: new Date(Date.UTC(2026, 8, 12)) });
    const res = await service.search(makeParams({ directOnly: true, q: `DirectYes ${suffix}` }));
    expect(res.data.map((r) => r.id)).toContain(direct);
    // With only the toggle (provider-scoped), every returned package is direct-only.
    const all = await service.search(makeParams({ directOnly: true }));
    expect(all.data.map((r) => r.id)).toContain(direct);
    expect(all.data.map((r) => r.id)).not.toContain(notDirect);
  });

  it("PRD combo: duration 9, maxPrice 30,000,000, September returns only qualifying packages", async () => {
    const good = await seedPackage({ title: `PrdGood ${suffix}`, duration: 9, priceQuad: 28_000_000, depDate: new Date(Date.UTC(2026, 8, 15)) });
    const pricey = await seedPackage({ title: `PrdPricey ${suffix}`, duration: 9, priceQuad: 35_000_000, depDate: new Date(Date.UTC(2026, 8, 15)) });
    const long = await seedPackage({ title: `PrdLong ${suffix}`, duration: 12, priceQuad: 28_000_000, depDate: new Date(Date.UTC(2026, 8, 15)) });
    const october = await seedPackage({ title: `PrdOctober ${suffix}`, duration: 9, priceQuad: 28_000_000, depDate: new Date(Date.UTC(2026, 9, 15)) });
    const res = await service.search(makeParams({
      durationMin: 9, durationMax: 9, maxPrice: 30_000_000, monthFrom: "2026-09", monthTo: "2026-09",
    }));
    const ids = res.data.map((r) => r.id);
    expect(ids).toContain(good);
    expect(ids).not.toContain(pricey);
    expect(ids).not.toContain(long);
    expect(ids).not.toContain(october);
  });

  it("excludes a package whose only matching departure has zero seats when the toggle is on", async () => {
    const full = await seedPackage({ title: `SeatsZero ${suffix}`, seatBooked: 45, depDate: new Date(Date.UTC(2026, 8, 12)) });
    const on = await service.search(makeParams({ seatsAvailableOnly: true, q: `SeatsZero ${suffix}` }));
    expect(on.data.map((r) => r.id)).not.toContain(full);
    const off = await service.search(makeParams({ seatsAvailableOnly: false, q: `SeatsZero ${suffix}` }));
    expect(off.data.map((r) => r.id)).toContain(full);
  });

  it("falls back to priceQuad when the selected occupancy price is null", async () => {
    // priceTriple null, priceQuad within budget, triple selected -> qualifies via fallback.
    const hit = await seedPackage({ title: `OccFallback ${suffix}`, priceQuad: 29_000_000, priceTriple: null, depDate: new Date(Date.UTC(2026, 8, 12)) });
    const res = await service.search(makeParams({ occupancy: "triple", maxPrice: 30_000_000, q: `OccFallback ${suffix}` }));
    expect(res.data.map((r) => r.id)).toContain(hit);
  });
});
