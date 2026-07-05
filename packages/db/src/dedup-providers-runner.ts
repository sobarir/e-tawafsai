/**
 * CLI runner for the one-time provider dedup. Run AFTER deploying the
 * normalization + 409 pre-check, and BEFORE the unique-index migration:
 *
 *   bun run db:dedup-providers    # (bun src/dedup-providers-runner.ts)
 *
 * Excluded from the library build (like seed.ts); the merge logic itself
 * lives in ./scripts/dedup-providers.ts.
 */
import { databaseUrl } from "../env";
import { createDb } from "./index";
import { dedupeProviders } from "./scripts/dedup-providers";

async function main() {
  const db = createDb(databaseUrl);
  const plans = await dedupeProviders(db);
  console.log(JSON.stringify({ event: "provider.dedup.done", clusters: plans.length }));
  process.exit(0);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
