import { ulid } from "ulid";
import { packages, packageHotels, hotels, departures, providers, type Database } from "../index";

/**
 * Seeds a deterministic 1,000-package / 5,000-departure volume fixture for one
 * tenant, used by the search benchmark integration spec. Returns ids for cleanup.
 */
export async function seedSearchBenchmark(
  db: Database,
  tenantId: string,
): Promise<{ providerId: string; packageIds: string[]; hotelIds: string[] }> {
  const suffix = ulid().toLowerCase();
  const providerId = ulid();
  await db.insert(providers).values({
    id: providerId,
    tenantId,
    name: `PT Bench ${suffix}`,
    brandName: `Bench ${suffix}`,
    ppiuLicenseNo: "U.999 TAHUN 2024",
    accreditation: "A",
    contactPerson: "Bench",
    contactPhone: "62800000000",
    isActive: true,
    pricePublicationConsentAt: new Date(),
  });

  const packageIds: string[] = [];
  const hotelIds: string[] = [];
  const pkgRows: (typeof packages.$inferInsert)[] = [];
  const hotelRows: (typeof hotels.$inferInsert)[] = [];
  const linkRows: (typeof packageHotels.$inferInsert)[] = [];
  const depRows: (typeof departures.$inferInsert)[] = [];
  // Catalog hotels are deduped by name+city (unique per tenant), so a name
  // reused across packages (e.g. Fairmont) is one catalog row linked N times.
  const hotelIdByName = new Map<string, string>();
  const statuses = ["open", "almost_full", "full", "departed", "cancelled"] as const;

  for (let i = 0; i < 1000; i++) {
    const id = ulid();
    packageIds.push(id);
    const duration = 9 + (i % 5); // 9..13
    pkgRows.push({
      id,
      tenantId,
      providerId,
      productType: "umrah",
      title: `Bench Umrah ${suffix} ${i}`,
      slug: `bench-umrah-${suffix}-${i}`,
      durationDays: duration,
      description: `Paket umrah nyaman dekat Masjidil Haram ${i}`,
      directOnly: i % 4 === 0,
      status: "published",
      hasBeenPublished: true,
    });
    const hotelName = i % 50 === 0 ? `Fairmont Clock Tower ${suffix}` : `Hotel Makkah ${i}`;
    let hotelId = hotelIdByName.get(hotelName);
    if (!hotelId) {
      hotelId = ulid();
      hotelIdByName.set(hotelName, hotelId);
      hotelIds.push(hotelId);
      hotelRows.push({
        id: hotelId,
        tenantId,
        name: hotelName,
        city: "Makkah",
        stars: 3 + (i % 3),
        distanceM: 100 + (i % 10) * 50,
        isPelataran: false,
        isActive: true,
      });
    }
    linkRows.push({ id: ulid(), packageId: id, hotelId });

    for (let d = 0; d < 5; d++) {
      const month = 8 + (d % 5); // Sep(8)..Jan of 2027 via Date rollover
      const depDate = new Date(Date.UTC(2026, month, 10 + d));
      depRows.push({
        id: ulid(),
        tenantId,
        packageId: id,
        departureType: "fixed_date",
        departureDate: depDate,
        returnDate: new Date(depDate.getTime() + duration * 86400000),
        seatTotal: 45,
        seatBooked: d === 0 ? 45 : 10 + d, // d===0 -> zero seats available
        seatHeld: 0,
        currency: "IDR",
        priceQuad: 25_000_000 + (i % 20) * 500_000,
        priceTriple: d % 2 === 0 ? null : 27_000_000, // some nulls -> exercise fallback
        priceDouble: 30_000_000,
        dpAmount: 5_000_000,
        paymentSchedule: JSON.stringify([
          { name: "DP", amount: 5_000_000, daysBeforeDeparture: 60 },
        ]),
        status: statuses[d], // d=0 open, d=1 almost_full, d>=2 non-sellable
      });
    }
  }

  // Chunked inserts to stay within parameter limits.
  const chunk = <T>(arr: T[], n: number): T[][] =>
    Array.from({ length: Math.ceil(arr.length / n) }, (_, k) => arr.slice(k * n, k * n + n));
  for (const c of chunk(pkgRows, 500)) await db.insert(packages).values(c);
  for (const c of chunk(hotelRows, 500)) await db.insert(hotels).values(c);
  for (const c of chunk(linkRows, 500)) await db.insert(packageHotels).values(c);
  for (const c of chunk(depRows, 500)) await db.insert(departures).values(c);

  return { providerId, packageIds, hotelIds };
}
