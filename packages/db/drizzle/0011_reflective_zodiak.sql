ALTER TABLE "packages" ADD COLUMN "direct_only" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- NOTE: unaccent() is STABLE, not IMMUTABLE, so Postgres rejects it inside a
-- generated column (SQLSTATE 42P17). Per design §1.2/§6 we take the documented
-- fallback: plain 'simple' config without unaccent. The query side (Task 6)
-- likewise omits unaccent() from plainto_tsquery to stay symmetric.
ALTER TABLE "packages" ADD COLUMN "search_doc" tsvector
  GENERATED ALWAYS AS (
    to_tsvector('simple',
      coalesce("title",'') || ' ' ||
      coalesce("description",'') || ' ' ||
      coalesce("airline",''))
  ) STORED;--> statement-breakpoint
CREATE INDEX "packages_search_doc_gin" ON "packages" USING gin ("search_doc");--> statement-breakpoint
CREATE INDEX "departures_search_idx" ON "departures" ("tenant_id", "status", "departure_date", "price_quad");