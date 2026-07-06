/**
 * Seed script - run AFTER `db:migrate`. Order matters: migrate, then seed.
 * Idempotent: re-running upserts the default tenant and demo accounts.
 */
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as bcrypt from "bcryptjs";
import { and, eq } from "drizzle-orm";
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

  const starterTags = [
    "visa",
    "tiket PP",
    "hotel",
    "makan 3x",
    "bus AC",
    "muthawif",
    "perlengkapan umrah",
    "asuransi",
    "handling",
    "airport tax",
    "kereta cepat Haramain",
  ];

  for (const tagName of starterTags) {
    await db
      .insert(schema.tags)
      .values({
        id: ulid(),
        tenantId: tenant.id,
        name: tagName,
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
        airline: "Saudi Arabian Airlines",
        flightRoute: "CGK-JED-CGK",
        departureCity: "Jakarta",
        status: "published",
        hasBeenPublished: true,
      })
      .onConflictDoNothing();

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
