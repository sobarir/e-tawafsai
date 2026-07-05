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

  console.log(
    "Seed complete: default tenant + admin@cometkit.dev (admin), staff@cometkit.dev (staff) / password123",
  );
  await client.end();
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
