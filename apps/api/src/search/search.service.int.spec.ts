import { config } from "dotenv";
import { resolve } from "node:path";
import { ulid } from "ulid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ClsService } from "nestjs-cls";
import type { ConfigService } from "@nestjs/config";
import {
  createDb,
  tenants,
  providers,
  packages,
  packageCategories,
  packageHotels,
  hotels,
  departures,
  airlines,
  type Database,
} from "@cometkit/db";
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
  const categoryIds: string[] = [];
  const airlineIds: string[] = [];
  const hotelIds: string[] = [];

  // Create a Makkah catalog hotel and link it to a package.
  async function linkHotel(
    packageId: string,
    name: string,
    stars = 5,
    distanceM = 150,
  ): Promise<void> {
    const hotelId = ulid();
    await db.insert(hotels).values({ id: hotelId, tenantId, name, city: "Makkah", stars, distanceM, isPelataran: false });
    hotelIds.push(hotelId);
    await db.insert(packageHotels).values({ id: ulid(), packageId, hotelId });
  }

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

  async function createAirline(name: string): Promise<string> {
    const id = ulid();
    await db.insert(airlines).values({ id, tenantId, name });
    airlineIds.push(id);
    return id;
  }

  async function createCategory(name: string): Promise<string> {
    const id = ulid();
    await db.insert(packageCategories).values({
      id,
      tenantId,
      providerId,
      productType: "umrah",
      name,
    });
    categoryIds.push(id);
    return id;
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
    categoryId?: string | null;
    airlineId?: string | null;
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
      categoryId: opts.categoryId ?? null,
      airlineId: opts.airlineId ?? null,
      durationDays: opts.duration ?? 9,
      description: "paket",
      directOnly: opts.directOnly ?? false,
      status: "published",
      hasBeenPublished: true,
    });
    if (opts.hotelName) {
      await linkHotel(id, opts.hotelName);
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
    if (hotelIds.length) {
      await db.delete(hotels).where(inArray(hotels.id, hotelIds));
    }
    // Packages reference categories/airlines via FKs — delete packages first (above).
    if (categoryIds.length) {
      await db.delete(packageCategories).where(inArray(packageCategories.id, categoryIds));
    }
    if (airlineIds.length) {
      await db.delete(airlines).where(inArray(airlines.id, airlineIds));
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

  it("excludes when the fallback priceQuad still exceeds the budget", async () => {
    // triple null -> compares priceQuad (31M) which is over the 30M budget.
    const miss = await seedPackage({ title: `OccTooHigh ${suffix}`, priceQuad: 31_000_000, priceTriple: null, depDate: new Date(Date.UTC(2026, 8, 12)) });
    const res = await service.search(makeParams({ occupancy: "triple", maxPrice: 30_000_000, q: `OccTooHigh ${suffix}` }));
    expect(res.data.map((r) => r.id)).not.toContain(miss);
  });

  it("priceFrom is the cheapest matching departure while date/prices come from the earliest", async () => {
    const id = ulid();
    pkgIds.push(id);
    await db.insert(packages).values({
      id, tenantId, providerId, productType: "umrah", title: `PriceFrom ${suffix}`,
      slug: `pricefrom-${suffix}`, durationDays: 9, description: "paket",
      directOnly: false, status: "published", hasBeenPublished: true,
    });
    const mkDep = (depDate: Date, priceQuad: number) => ({
      id: ulid(), tenantId, packageId: id, departureType: "fixed_date" as const,
      departureDate: depDate, returnDate: new Date(depDate.getTime() + 9 * 86400000),
      seatTotal: 45, seatBooked: 10, seatHeld: 0, currency: "IDR" as const,
      priceQuad, priceTriple: priceQuad + 2_000_000, priceDouble: priceQuad + 5_000_000, dpAmount: 5_000_000,
      paymentSchedule: JSON.stringify([{ name: "DP", amount: 5_000_000, daysBeforeDeparture: 60 }]),
      status: "open" as const,
    });
    // Earliest departure is the pricier one; a later departure is cheaper.
    await db.insert(departures).values(mkDep(new Date(Date.UTC(2026, 8, 10)), 30_000_000));
    await db.insert(departures).values(mkDep(new Date(Date.UTC(2026, 8, 20)), 26_000_000));
    const res = await service.search(makeParams({ q: `PriceFrom ${suffix}` }));
    const row = res.data.find((r) => r.id === id)!;
    // priceByOccupancy.quad = the EARLIEST departure's quad (30M, not the later 26M),
    // proving the earliest row was selected; priceFrom = MIN across matching (26M).
    // (Exact ISO not asserted: departureDate is a tz-naive `timestamp` column.)
    expect(row.priceByOccupancy.quad).toBe(30_000_000);
    expect(row.priceFrom).toBe(26_000_000);
    expect(new Date(row.nextDepartureDate).getTime()).toBeLessThan(Date.UTC(2026, 8, 20)); // before the later departure
  });

  it("paginates without duplicating or skipping packages that share a departure date", async () => {
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) {
      ids.push(await seedPackage({ title: `Page ${suffix} ${i}`, depDate: new Date(Date.UTC(2026, 8, 12)) }));
    }
    const p1 = await service.search(makeParams({ q: `Page ${suffix}`, page: 1, pageSize: 2 }));
    const p2 = await service.search(makeParams({ q: `Page ${suffix}`, page: 2, pageSize: 2 }));
    const seen = [...p1.data.map((r) => r.id), ...p2.data.map((r) => r.id)];
    expect(p1.meta.total).toBe(3);
    expect(new Set(seen).size).toBe(seen.length); // no duplicates across pages
    expect(new Set(seen)).toEqual(new Set(ids)); // full, exact coverage
  });

  it("filters by hotel city with min stars and max distance", async () => {
    const near5 = await seedPackage({ title: `HotelNear ${suffix}`, hotelName: `Near Hotel ${suffix}`, depDate: new Date(Date.UTC(2026, 8, 12)) });
    // near5's seeded hotel is Makkah, 5 stars, 150 m (see seedPackage).
    const far3Id = ulid();
    pkgIds.push(far3Id);
    await db.insert(packages).values({
      id: far3Id, tenantId, providerId, productType: "umrah", title: `HotelFar ${suffix}`,
      slug: `hotelfar-${suffix}`, durationDays: 9, description: "paket",
      directOnly: false, status: "published", hasBeenPublished: true,
    });
    await linkHotel(far3Id, `Far Hotel ${suffix}`, 3, 900);
    await db.insert(departures).values({
      id: ulid(), tenantId, packageId: far3Id, departureType: "fixed_date",
      departureDate: new Date(Date.UTC(2026, 8, 12)), returnDate: new Date(Date.UTC(2026, 8, 21)),
      seatTotal: 45, seatBooked: 10, seatHeld: 0, currency: "IDR", priceQuad: 28_000_000, priceTriple: 30_000_000, priceDouble: 33_000_000,
      dpAmount: 5_000_000, paymentSchedule: JSON.stringify([{ name: "DP", amount: 5_000_000, daysBeforeDeparture: 60 }]), status: "open",
    });
    const res = await service.search(makeParams({ hotelCity: "Makkah", minStars: 4, maxDistanceM: 300 }));
    const ids = res.data.map((r) => r.id);
    expect(ids).toContain(near5);
    expect(ids).not.toContain(far3Id);
  });

  it("filters by category name via the joined package_categories row", async () => {
    const categoryName = `VIP Umrah ${suffix}`;
    const categoryId = await createCategory(categoryName);
    const hit = await seedPackage({ title: `CatHit ${suffix}`, depDate: new Date(Date.UTC(2026, 8, 12)), categoryId });
    const miss = await seedPackage({ title: `CatMiss ${suffix}`, depDate: new Date(Date.UTC(2026, 8, 12)) });
    const res = await service.search(makeParams({ category: categoryName }));
    const ids = res.data.map((r) => r.id);
    expect(ids).toContain(hit);
    expect(ids).not.toContain(miss);
    expect(res.data.find((r) => r.id === hit)!.category).toBe(categoryName);
  });

  it("filters by airline name via the joined airlines row and returns it on the result", async () => {
    const airlineName = `Saudia ${suffix}`;
    const airlineId = await createAirline(airlineName);
    const hit = await seedPackage({ title: `AirHit ${suffix}`, depDate: new Date(Date.UTC(2026, 8, 12)), airlineId });
    const miss = await seedPackage({ title: `AirMiss ${suffix}`, depDate: new Date(Date.UTC(2026, 8, 12)) });
    const res = await service.search(makeParams({ airline: airlineName }));
    const ids = res.data.map((r) => r.id);
    expect(ids).toContain(hit);
    expect(ids).not.toContain(miss);
    expect(res.data.find((r) => r.id === hit)!.airline).toBe(airlineName);
  });
});
