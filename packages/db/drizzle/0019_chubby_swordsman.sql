CREATE TABLE "hotels" (
	"id" char(26) PRIMARY KEY NOT NULL,
	"tenant_id" char(26) NOT NULL,
	"name" varchar(120) NOT NULL,
	"city" varchar(120) NOT NULL,
	"stars" integer DEFAULT 3 NOT NULL,
	"distance_m" integer,
	"is_pelataran" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DELETE FROM "package_hotels";--> statement-breakpoint
ALTER TABLE "package_hotels" ADD COLUMN "hotel_id" char(26) NOT NULL;--> statement-breakpoint
ALTER TABLE "hotels" ADD CONSTRAINT "hotels_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "hotels_tenant_name_city_idx" ON "hotels" USING btree ("tenant_id",lower(btrim("name")),lower(btrim("city")));--> statement-breakpoint
ALTER TABLE "package_hotels" ADD CONSTRAINT "package_hotels_hotel_id_hotels_id_fk" FOREIGN KEY ("hotel_id") REFERENCES "public"."hotels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "package_hotels_hotel_id_idx" ON "package_hotels" USING btree ("hotel_id");--> statement-breakpoint
ALTER TABLE "package_hotels" DROP COLUMN "city_name";--> statement-breakpoint
ALTER TABLE "package_hotels" DROP COLUMN "name";--> statement-breakpoint
ALTER TABLE "package_hotels" DROP COLUMN "stars";--> statement-breakpoint
ALTER TABLE "package_hotels" DROP COLUMN "distance_m";--> statement-breakpoint
ALTER TABLE "package_hotels" DROP COLUMN "is_pelataran";--> statement-breakpoint
ALTER TABLE "package_hotels" ADD CONSTRAINT "package_hotels_package_hotel_idx" UNIQUE("package_id","hotel_id");