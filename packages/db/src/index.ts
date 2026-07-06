import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export function createDb(url: string) {
  const client = postgres(url, {
    max: 10,
    // Server NOTICEs are informational (e.g. collation-version warnings
    // after an OS libc update) — don't dump them to stdout. Real errors
    // still throw and are handled by the app's own error paths.
    onnotice: () => undefined,
  });
  return drizzle(client, { schema });
}

export type Database = ReturnType<typeof createDb>;

export * from "./columns";
export * from "./schema";
export { schema };

// Test/benchmark seed fixture. Inert unless called; imported by the search
// benchmark integration spec.
export * from "./fixtures/search-benchmark";

// One-time provider dedup script. Inert unless called (CLI guard); the merge
// helpers are imported by the dedup integration spec.
export * from "./scripts/dedup-providers";

// One-time package-category backfill script. Inert unless called (CLI
// guard); the backfill helper is imported by its integration spec.
export * from "./scripts/backfill-categories";
