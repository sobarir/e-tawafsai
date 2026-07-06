/**
 * CLI runner for the one-time package-category backfill. Run AFTER
 * deploying the package_categories table + packages.category_id column,
 * and BEFORE the enum-column cutover migration:
 *
 *   bun run db:backfill-categories    # (bun src/category-backfill-runner.ts)
 *
 * Excluded from the library build (like seed.ts); the backfill logic itself
 * lives in ./scripts/backfill-categories.ts.
 */
import { databaseUrl } from "../env";
import { createDb } from "./index";
import { backfillCategories } from "./scripts/backfill-categories";

async function main() {
  const db = createDb(databaseUrl);
  const result = await backfillCategories(db);
  console.log(JSON.stringify({ event: "category.backfill.done.summary", ...result }));
  process.exit(0);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
