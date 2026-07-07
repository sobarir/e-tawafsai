CREATE TABLE "airlines" (
	"id" char(26) PRIMARY KEY NOT NULL,
	"tenant_id" char(26) NOT NULL,
	"name" varchar(120) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "departure_cities" (
	"id" char(26) PRIMARY KEY NOT NULL,
	"tenant_id" char(26) NOT NULL,
	"name" varchar(120) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "packages" ADD COLUMN "airline_id" char(26);--> statement-breakpoint
ALTER TABLE "packages" ADD COLUMN "departure_city_id" char(26);--> statement-breakpoint
ALTER TABLE "airlines" ADD CONSTRAINT "airlines_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "departure_cities" ADD CONSTRAINT "departure_cities_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "airlines_tenant_name_idx" ON "airlines" USING btree ("tenant_id",lower(btrim("name")));--> statement-breakpoint
CREATE UNIQUE INDEX "departure_cities_tenant_name_idx" ON "departure_cities" USING btree ("tenant_id",lower(btrim("name")));--> statement-breakpoint
ALTER TABLE "packages" ADD CONSTRAINT "packages_airline_id_airlines_id_fk" FOREIGN KEY ("airline_id") REFERENCES "public"."airlines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "packages" ADD CONSTRAINT "packages_departure_city_id_departure_cities_id_fk" FOREIGN KEY ("departure_city_id") REFERENCES "public"."departure_cities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
INSERT INTO "airlines" ("id", "tenant_id", "name", "is_active", "created_at", "updated_at")
SELECT DISTINCT ON (p."tenant_id", lower(btrim(p."airline")))
	upper(substr(md5(p."tenant_id" || lower(btrim(p."airline"))), 1, 26)),
	p."tenant_id", btrim(p."airline"), true, now(), now()
FROM "packages" p
WHERE p."airline" IS NOT NULL AND btrim(p."airline") <> ''
ON CONFLICT DO NOTHING;--> statement-breakpoint
UPDATE "packages" p SET "airline_id" = a."id"
FROM "airlines" a
WHERE a."tenant_id" = p."tenant_id"
	AND lower(btrim(a."name")) = lower(btrim(p."airline"))
	AND p."airline" IS NOT NULL AND btrim(p."airline") <> '';--> statement-breakpoint
INSERT INTO "departure_cities" ("id", "tenant_id", "name", "is_active", "created_at", "updated_at")
SELECT DISTINCT ON (p."tenant_id", lower(btrim(p."departure_city")))
	upper(substr(md5(p."tenant_id" || lower(btrim(p."departure_city"))), 1, 26)),
	p."tenant_id", btrim(p."departure_city"), true, now(), now()
FROM "packages" p
WHERE p."departure_city" IS NOT NULL AND btrim(p."departure_city") <> ''
ON CONFLICT DO NOTHING;--> statement-breakpoint
UPDATE "packages" p SET "departure_city_id" = dc."id"
FROM "departure_cities" dc
WHERE dc."tenant_id" = p."tenant_id"
	AND lower(btrim(dc."name")) = lower(btrim(p."departure_city"))
	AND p."departure_city" IS NOT NULL AND btrim(p."departure_city") <> '';