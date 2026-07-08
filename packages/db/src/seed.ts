/**
 * Seed script - run AFTER `db:migrate`. Order matters: migrate, then seed.
 * Idempotent: re-running upserts the default tenant and demo accounts.
 */
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as bcrypt from "bcryptjs";
import { and, eq, inArray } from "drizzle-orm";
import { ulid } from "ulid";
import { DEFAULT_TENANT_SLUG, tenantInputSchema } from "@cometkit/shared";
import { databaseUrl } from "../env";
import * as schema from "./schema";

const DEMO_ACCOUNTS = [
  { email: "admin@e-tawafsai.dev", name: "Demo Admin", role: "admin" as const },
  { email: "staff@e-tawafsai.dev", name: "Demo Staff", role: "staff" as const },
];

async function main() {
  const client = postgres(databaseUrl, { max: 1 });
  const db = drizzle(client, { schema });

  // Default tenant: validated through the shared contract (proves seam rejection
  // path is real), upserted by its well-known slug.
  const tenantInput = tenantInputSchema.parse({
    name: "Default Tenant",
    slug: DEFAULT_TENANT_SLUG,
    tenantType: "agent",
    plan: "subscription",
    planStatus: "active",
    brandName: "Default Tenant",
  });

  await db
    .insert(schema.tenants)
    .values({ id: ulid(), ...tenantInput })
    .onConflictDoUpdate({
      target: schema.tenants.slug,
      set: { name: tenantInput.name, brandName: tenantInput.brandName },
    });

  const [tenant] = await db
    .select({ id: schema.tenants.id })
    .from(schema.tenants)
    .where(eq(schema.tenants.slug, DEFAULT_TENANT_SLUG));
  if (!tenant) throw new Error("Default tenant seed failed");

  const passwordHash = await bcrypt.hash("password123", 10);

  for (const account of DEMO_ACCOUNTS) {
    await db
      .insert(schema.users)
      .values({ id: ulid(), tenantId: tenant.id, passwordHash, ...account })
      .onConflictDoUpdate({
        target: [schema.users.tenantId, schema.users.email],
        set: { passwordHash, name: account.name, role: account.role },
      });
  }

  await db
    .insert(schema.providers)
    .values({
      id: ulid(),
      tenantId: tenant.id,
      name: "PT. Handoff Al-Amin",
      brandName: "Al-Amin Umrah",
      ppiuLicenseNo: "PPIU-999-2026",
      accreditation: "A",
      contactPerson: "Budi",
      contactPhone: "62812345678",
      isActive: true,
      pricePublicationConsentAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .onConflictDoNothing();

  const starterTemplates = [
    {
      id: ulid(),
      tenantId: tenant.id,
      key: "greeting",
      label: "Greeting",
      body: "Halo {customerName}, selamat datang! Saya {agentName} akan membantu Anda hari ini.",
    },
    {
      id: ulid(),
      tenantId: tenant.id,
      key: "price_quote",
      label: "Price Quote",
      body: "Halo {customerName}, berikut penawaran harga untuk paket {packageName}: Rp {packagePrice}.",
    },
    {
      id: ulid(),
      tenantId: tenant.id,
      key: "dp_reminder",
      label: "Down Payment Reminder",
      body: "Halo {customerName}, mohon segera melakukan pembayaran Down Payment untuk paket {packageName} sebesar Rp {dpAmount}.",
    },
    {
      id: ulid(),
      tenantId: tenant.id,
      key: "h60_reminder",
      label: "H-60 Departure Reminder",
      body: "Halo {customerName}, mengingatkan keberangkatan paket {packageName} Anda kurang 60 hari lagi pada tanggal {departureDate}.",
    },
    {
      id: ulid(),
      tenantId: tenant.id,
      key: "h30_reminder",
      label: "H-30 Settlement Reminder",
      body: "Halo {customerName}, sisa pembayaran Anda untuk paket {packageName} sebesar Rp {remainingAmount} jatuh tempo pada {dueDate}.",
    },
    {
      id: ulid(),
      tenantId: tenant.id,
      key: "doc_checklist",
      label: "Document Checklist",
      body: "Halo {customerName}, mohon melengkapi berkas berikut: {checklistItems}.",
    },
    {
      id: ulid(),
      tenantId: tenant.id,
      key: "testimonial_ask",
      label: "Testimonial Request",
      body: "Halo {customerName}, bagaimana pengalaman Anda mengikuti paket {packageName}? Kirim ulasan Anda ya!",
    },
  ];

  for (const template of starterTemplates) {
    await db
      .insert(schema.messageTemplates)
      .values(template)
      .onConflictDoUpdate({
        target: [schema.messageTemplates.tenantId, schema.messageTemplates.key],
        set: { label: template.label, body: template.body },
      });
  }

  const starterInclusions = [
    "Visa",
    "Tiket Pesawat PP",
    "Hotel Makkah & Madinah",
    "Makan 3x",
    "Bus AC",
    "Muthawif (Guide)",
    "Perlengkapan Umrah",
    "Asuransi",
    "Handling & Airport Tax",
    "Kereta Cepat Haramain",
  ];

  const starterExclusions = [
    "Pembuatan Paspor",
    "Vaksin Meningitis",
    "Pengeluaran Pribadi",
    "Laundry",
    "Kelebihan Bagasi",
    "Tips Driver & Guide",
    "Surcharge Kamar (Double/Triple)",
  ];

  for (const name of starterInclusions) {
    await db
      .insert(schema.inclusions)
      .values({
        id: ulid(),
        tenantId: tenant.id,
        name,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .onConflictDoNothing();
  }

  for (const name of starterExclusions) {
    await db
      .insert(schema.exclusions)
      .values({
        id: ulid(),
        tenantId: tenant.id,
        name,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .onConflictDoNothing();
  }

  // Seed demo package
  const [provider] = await db
    .select({
      id: schema.providers.id,
      defaultCommissionType: schema.providers.defaultCommissionType,
      defaultCommissionValue: schema.providers.defaultCommissionValue,
    })
    .from(schema.providers)
    .where(eq(schema.providers.name, "PT. Handoff Al-Amin"));

  if (provider) {
    // Demo package category: idempotent upsert by the (tenant, provider,
    // productType, normalized name) unique index, then look up its id so the
    // demo package can be repointed at it (mirrors the backfill script's
    // seed step, at data-seed scale).
    await db
      .insert(schema.packageCategories)
      .values({
        id: ulid(),
        tenantId: tenant.id,
        providerId: provider.id,
        productType: "umrah",
        name: "Regular",
        commissionType: provider.defaultCommissionType,
        commissionValue: provider.defaultCommissionValue,
      })
      .onConflictDoNothing();

    const [demoCategory] = await db
      .select({ id: schema.packageCategories.id })
      .from(schema.packageCategories)
      .where(
        and(
          eq(schema.packageCategories.tenantId, tenant.id),
          eq(schema.packageCategories.providerId, provider.id),
          eq(schema.packageCategories.productType, "umrah"),
          eq(schema.packageCategories.name, "Regular"),
        ),
      );

    // Starter airline / departure-city master rows for the demo tenant only.
    // Real tenants curate their own via the admin UI; the migration only
    // backfills their existing free-text values.
    const STARTER_AIRLINES = [
      "Garuda Indonesia", "Saudia", "Lion Air", "Citilink", "Batik Air", "Saudi Arabian Airlines",
    ];
    const STARTER_CITIES = [
      "Jakarta", "Surabaya", "Medan", "Makassar", "Solo", "Balikpapan",
    ];
    for (const name of STARTER_AIRLINES) {
      await db.insert(schema.airlines)
        .values({ id: ulid(), tenantId: tenant.id, name, isActive: true })
        .onConflictDoNothing();
    }
    for (const name of STARTER_CITIES) {
      await db.insert(schema.departureCities)
        .values({ id: ulid(), tenantId: tenant.id, name, isActive: true })
        .onConflictDoNothing();
    }
    const [demoAirline] = await db
      .select({ id: schema.airlines.id })
      .from(schema.airlines)
      .where(and(eq(schema.airlines.tenantId, tenant.id), eq(schema.airlines.name, "Saudi Arabian Airlines")));
    const [demoCity] = await db
      .select({ id: schema.departureCities.id })
      .from(schema.departureCities)
      .where(and(eq(schema.departureCities.tenantId, tenant.id), eq(schema.departureCities.name, "Jakarta")));

    // Idempotent: reuse the existing demo package id when re-seeding so the
    // departure FK below never points at a freshly generated (unsaved) id.
    const [existingPackage] = await db
      .select({ id: schema.packages.id })
      .from(schema.packages)
      .where(
        and(
          eq(schema.packages.tenantId, tenant.id),
          eq(schema.packages.slug, "paket-umrah-akbar-9-hari"),
        ),
      );
    const packageId = existingPackage?.id ?? ulid();
    await db
      .insert(schema.packages)
      .values({
        id: packageId,
        tenantId: tenant.id,
        providerId: provider.id,
        productType: "umrah",
        title: "Paket Umrah Akbar 9 Hari",
        slug: "paket-umrah-akbar-9-hari",
        categoryId: demoCategory?.id,
        durationDays: 9,
        description: "Paket Umrah Al-Amin Akbar regular 9 hari hemat dan lengkap.",
        airlineId: demoAirline?.id,
        flightRoute: "CGK-JED-CGK",
        departureCityId: demoCity?.id,
        status: "published",
        hasBeenPublished: true,
      })
      .onConflictDoNothing();

    // Starter hotel catalog for the demo tenant only. Real tenants curate
    // their own via the admin UI (the migration ships an empty catalog).
    const STARTER_HOTELS: {
      name: string; city: string; stars: number; distanceM: number | null; isPelataran: boolean;
    }[] = [
      { name: "Swissotel Al Maqam", city: "Makkah", stars: 5, distanceM: 50, isPelataran: true },
      { name: "Hilton Makkah Convention", city: "Makkah", stars: 5, distanceM: 250, isPelataran: false },
      { name: "Anwar Al Madinah Movenpick", city: "Madinah", stars: 5, distanceM: 100, isPelataran: false },
    ];
    for (const h of STARTER_HOTELS) {
      await db.insert(schema.hotels)
        .values({ id: ulid(), tenantId: tenant.id, ...h, isActive: true })
        .onConflictDoNothing();
    }
    // Link a Makkah + a Madinah hotel to the demo package so it stays publishable.
    const linkHotels = await db
      .select({ id: schema.hotels.id })
      .from(schema.hotels)
      .where(and(
        eq(schema.hotels.tenantId, tenant.id),
        inArray(schema.hotels.name, ["Swissotel Al Maqam", "Anwar Al Madinah Movenpick"]),
      ));
    for (const h of linkHotels) {
      await db.insert(schema.packageHotels)
        .values({ id: ulid(), packageId, hotelId: h.id })
        .onConflictDoNothing();
    }

    // Seed mock departure (only once — a departure's sole unique key is its
    // id, so onConflictDoNothing cannot dedupe re-runs on its own).
    const [existingDeparture] = await db
      .select({ id: schema.departures.id })
      .from(schema.departures)
      .where(eq(schema.departures.packageId, packageId));
    if (!existingDeparture) {
      await db
        .insert(schema.departures)
        .values({
          id: ulid(),
          tenantId: tenant.id,
          packageId,
          departureType: "fixed_date",
          departureDate: new Date("2026-08-15T00:00:00Z"),
          returnDate: new Date("2026-08-24T00:00:00Z"),
          seatTotal: 45,
          seatBooked: 0,
          seatHeld: 0,
          currency: "IDR",
          priceQuad: 35000000,
          dpAmount: 5000000,
          paymentSchedule: JSON.stringify([
            { name: "DP", amount: 5000000, daysBeforeDeparture: 60 },
          ]),
          status: "open",
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .onConflictDoNothing();
    }
  }

  console.log(
    "Seed complete: default tenant + admin@e-tawafsai.dev (admin), staff@e-tawafsai.dev (staff) / password123",
  );
  await client.end();
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
