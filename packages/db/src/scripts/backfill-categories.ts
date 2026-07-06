/**
 * One-time backfill: creates `package_categories` rows from the legacy
 * `packages.category` enum and repoints every package to `category_id`. The
 * CLI entry lives in `src/category-backfill-runner.ts` (bun-run, excluded
 * from the build); these helpers are exported from the package and covered
 * by an integration spec.
 *
 * Per tenant, in one transaction:
 *  1. For each distinct (provider_id, product_type, category) present on
 *     packages still missing category_id, upsert a package_categories row
 *     named after the legacy enum's display name, commission seeded from
 *     that provider's default commission.
 *  2. Additionally seed the six LEGACY_CATEGORY_NAMES under "umrah" for
 *     every provider, plus under any product type the provider already has
 *     packages in - same seed commission. Both steps use onConflictDoNothing
 *     against the (tenant, provider, productType, normalized name) unique
 *     index, so re-running is a no-op.
 *  3. Repoint packages.category_id by matching
 *     (provider_id, product_type, lower(btrim(name)) = lower(display name))
 *     - only rows where category_id is still null are touched.
 *
 * Idempotent: onConflictDoNothing + `where category_id is null` mean a
 * second run reports { created: 0, repointed: 0 }.
 */
import { and, eq, isNull, sql } from "drizzle-orm";
import { LEGACY_CATEGORY_NAMES, PRODUCT_TYPES } from "@cometkit/shared";
import type { Database } from "../index";
import { tenants, providers, packages, packageCategories } from "../schema";

type ProductType = (typeof PRODUCT_TYPES)[number];

/** Legacy enum value -> the display name it becomes as a package_categories row. */
const LEGACY_CATEGORY_DISPLAY: Record<string, string> = {
  regular: "Regular",
  plus: "Plus",
  private_vip: "Private VIP",
  ramadan: "Ramadan",
  arbain: "Arbain",
  other: "Other",
};

/** One-time backfill of package_categories + packages.category_id, per tenant. */
export async function backfillCategories(db: Database): Promise<{ created: number; repointed: number }> {
  const allTenants = await db.select({ id: tenants.id }).from(tenants);

  let totalCreated = 0;
  let totalRepointed = 0;

  for (const tenant of allTenants) {
    const tenantId = tenant.id;
    let created = 0;
    let repointed = 0;

    await db.transaction(async (tx) => {
      const tenantProviders = await tx
        .select({
          id: providers.id,
          defaultCommissionType: providers.defaultCommissionType,
          defaultCommissionValue: providers.defaultCommissionValue,
        })
        .from(providers)
        .where(eq(providers.tenantId, tenantId));
      if (tenantProviders.length === 0) return;
      const providerById = new Map(tenantProviders.map((p) => [p.id, p]));

      // Every product type each provider already has packages in (regardless
      // of category_id), used to widen the legacy-name seed beyond "umrah".
      const productTypeRows = await tx
        .select({ providerId: packages.providerId, productType: packages.productType })
        .from(packages)
        .where(eq(packages.tenantId, tenantId))
        .groupBy(packages.providerId, packages.productType);
      const productTypesByProvider = new Map<string, Set<ProductType>>();
      for (const row of productTypeRows) {
        const set = productTypesByProvider.get(row.providerId) ?? new Set<ProductType>();
        set.add(row.productType);
        productTypesByProvider.set(row.providerId, set);
      }

      // Distinct (provider, productType, category) still needing a category.
      const distinctRows = await tx
        .select({
          providerId: packages.providerId,
          productType: packages.productType,
          category: packages.category,
        })
        .from(packages)
        .where(and(eq(packages.tenantId, tenantId), isNull(packages.categoryId)))
        .groupBy(packages.providerId, packages.productType, packages.category);

      // Step 1: upsert a category per distinct legacy (provider, productType, category).
      for (const row of distinctRows) {
        const provider = providerById.get(row.providerId);
        if (!provider) continue;
        const displayName = LEGACY_CATEGORY_DISPLAY[row.category] ?? row.category;
        const inserted = await tx
          .insert(packageCategories)
          .values({
            tenantId,
            providerId: row.providerId,
            productType: row.productType,
            name: displayName,
            commissionType: provider.defaultCommissionType,
            commissionValue: provider.defaultCommissionValue,
          })
          .onConflictDoNothing()
          .returning({ id: packageCategories.id });
        created += inserted.length;
      }

      // Step 2: seed the six legacy names under "umrah" + any product type
      // the provider already has packages in, for every provider.
      for (const provider of tenantProviders) {
        const productTypes = new Set<ProductType>(["umrah"]);
        for (const pt of productTypesByProvider.get(provider.id) ?? []) productTypes.add(pt);

        for (const productType of productTypes) {
          for (const name of LEGACY_CATEGORY_NAMES) {
            const inserted = await tx
              .insert(packageCategories)
              .values({
                tenantId,
                providerId: provider.id,
                productType,
                name,
                commissionType: provider.defaultCommissionType,
                commissionValue: provider.defaultCommissionValue,
              })
              .onConflictDoNothing()
              .returning({ id: packageCategories.id });
            created += inserted.length;
          }
        }
      }

      // Step 3: repoint packages.category_id for rows still missing it.
      for (const row of distinctRows) {
        const displayName = LEGACY_CATEGORY_DISPLAY[row.category] ?? row.category;
        const [category] = await tx
          .select({ id: packageCategories.id })
          .from(packageCategories)
          .where(
            and(
              eq(packageCategories.tenantId, tenantId),
              eq(packageCategories.providerId, row.providerId),
              eq(packageCategories.productType, row.productType),
              sql`lower(btrim(${packageCategories.name})) = lower(${displayName})`,
            ),
          );
        if (!category) continue;
        const updated = await tx
          .update(packages)
          .set({ categoryId: category.id })
          .where(
            and(
              eq(packages.tenantId, tenantId),
              eq(packages.providerId, row.providerId),
              eq(packages.productType, row.productType),
              eq(packages.category, row.category),
              isNull(packages.categoryId),
            ),
          )
          .returning({ id: packages.id });
        repointed += updated.length;
      }
    });

    if (created > 0 || repointed > 0) {
      console.log(JSON.stringify({ event: "category.backfill.tenant", tenantId, created, repointed }));
    }
    totalCreated += created;
    totalRepointed += repointed;
  }

  const nullCountRows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(packages)
    .where(isNull(packages.categoryId));
  const nullCategoryCount = nullCountRows[0]?.count ?? 0;
  console.log(
    JSON.stringify({
      event: "category.backfill.done",
      created: totalCreated,
      repointed: totalRepointed,
      nullCategoryCount,
    }),
  );

  return { created: totalCreated, repointed: totalRepointed };
}
