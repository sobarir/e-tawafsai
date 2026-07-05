/**
 * Seed script - run AFTER `db:migrate`. Order matters: migrate, then seed.
 * Idempotent: re-running upserts the default tenant and demo accounts.
 */
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { ulid } from "ulid";
import { DEFAULT_TENANT_SLUG, tenantInputSchema } from "@cometkit/shared";
import { databaseUrl } from "../env";
import * as schema from "./schema";

const DEMO_ACCOUNTS = [
  { email: "admin@cometkit.dev", name: "Demo Admin", role: "admin" as const },
  { email: "staff@cometkit.dev", name: "Demo Staff", role: "staff" as const },
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

  console.log(
    "Seed complete: default tenant + admin@cometkit.dev (admin), staff@cometkit.dev (staff) / password123",
  );
  await client.end();
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
