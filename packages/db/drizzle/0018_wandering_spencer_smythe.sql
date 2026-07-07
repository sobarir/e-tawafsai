-- The generated full-text column search_doc (migration 0011) references the
-- free-text "airline" column, so it must be dropped before "airline" can be
-- dropped, then recreated without it. Airline remains full-text searchable via
-- a query-side join on airlines.name (mirroring how hotel names are searched).
DROP INDEX IF EXISTS "packages_search_doc_gin";--> statement-breakpoint
ALTER TABLE "packages" DROP COLUMN "search_doc";--> statement-breakpoint
ALTER TABLE "packages" DROP COLUMN "airline";--> statement-breakpoint
ALTER TABLE "packages" DROP COLUMN "departure_city";--> statement-breakpoint
ALTER TABLE "packages" ADD COLUMN "search_doc" tsvector
  GENERATED ALWAYS AS (
    to_tsvector('simple',
      coalesce("title",'') || ' ' ||
      coalesce("description",''))
  ) STORED;--> statement-breakpoint
CREATE INDEX "packages_search_doc_gin" ON "packages" USING gin ("search_doc");
