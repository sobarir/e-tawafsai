/**
 * One-time provider dedup merge helpers. The CLI entry lives in
 * `src/dedup-providers-runner.ts` (bun-run, excluded from the build); these
 * helpers are exported from the package and covered by an integration spec.
 *
 * Per tenant, dedupeProviders normalizes blank PPIUs to NULL, clusters
 * duplicates (shared normalized name OR non-empty normalized PPIU), keeps a
 * canonical survivor (active first, then lowest ULID), repoints packages, and
 * deletes losers. Idempotent: a second run on clean data is a no-op.
 */
import { inArray, sql } from "drizzle-orm";
import {
  normalizePpiu,
  planProviderMerges,
  type ProviderMergeInput,
  type ProviderMergePlan,
} from "@cometkit/shared";
import type { Database } from "../index";
import { providers, packages } from "../schema";

/** Repoint packages loser→survivor and delete losers, all in one transaction. */
export async function applyProviderMerges(
  db: Database,
  plans: ProviderMergePlan[],
): Promise<{ repointed: number; deleted: number }> {
  let repointed = 0;
  let deleted = 0;
  await db.transaction(async (tx) => {
    for (const plan of plans) {
      if (plan.loserIds.length === 0) continue;
      const rp = await tx
        .update(packages)
        .set({ providerId: plan.survivorId })
        .where(inArray(packages.providerId, plan.loserIds))
        .returning({ id: packages.id });
      repointed += rp.length;
      const del = await tx
        .delete(providers)
        .where(inArray(providers.id, plan.loserIds))
        .returning({ id: providers.id });
      deleted += del.length;
    }
  });
  return { repointed, deleted };
}

/** One-time cleanup: normalize blank PPIUs, cluster per tenant, apply merges. */
export async function dedupeProviders(db: Database): Promise<ProviderMergePlan[]> {
  // 1. Blank/whitespace PPIU -> NULL so blanks are exempt from uniqueness.
  await db.update(providers).set({ ppiuLicenseNo: null }).where(sql`btrim(${providers.ppiuLicenseNo}) = ''`);

  // 2. Load all providers, group by tenant.
  const rows = await db
    .select({
      id: providers.id,
      tenantId: providers.tenantId,
      name: providers.name,
      ppiuLicenseNo: providers.ppiuLicenseNo,
      isActive: providers.isActive,
    })
    .from(providers);

  const byTenant = new Map<string, ProviderMergeInput[]>();
  for (const r of rows) {
    const list = byTenant.get(r.tenantId) ?? [];
    list.push({ id: r.id, name: r.name, ppiuLicenseNo: normalizePpiu(r.ppiuLicenseNo), isActive: r.isActive });
    byTenant.set(r.tenantId, list);
  }

  // 3. Plan + apply per tenant.
  const allPlans: ProviderMergePlan[] = [];
  for (const [tenantId, list] of byTenant) {
    const plans = planProviderMerges(list);
    if (plans.length === 0) continue;
    const res = await applyProviderMerges(db, plans);
    for (const p of plans) {
      // eslint-disable-next-line no-console
      console.log(
        JSON.stringify({ event: "provider.merged", tenantId, survivorId: p.survivorId, loserIds: p.loserIds }),
      );
    }
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ event: "provider.dedup.tenant", tenantId, ...res }));
    allPlans.push(...plans);
  }
  return allPlans;
}
