CREATE TYPE "public"."category" AS ENUM('regular', 'plus', 'private_vip', 'ramadan', 'arbain', 'other');--> statement-breakpoint
CREATE TYPE "public"."product_type" AS ENUM('umrah', 'haji_khusus', 'haji_furoda');--> statement-breakpoint
CREATE TYPE "public"."status" AS ENUM('draft', 'published', 'archived');--> statement-breakpoint
CREATE TABLE "package_flyers" (
	"id" char(26) PRIMARY KEY NOT NULL,
	"package_id" char(26) NOT NULL,
	"url" varchar(2048) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "package_hotels" (
	"id" char(26) PRIMARY KEY NOT NULL,
	"package_id" char(26) NOT NULL,
	"city_name" varchar(120) NOT NULL,
	"name" varchar(255) NOT NULL,
	"stars" integer DEFAULT 3 NOT NULL,
	"distance_m" integer,
	"is_pelataran" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "package_tags" (
	"package_id" char(26) NOT NULL,
	"tag_id" char(26) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "packages" (
	"id" char(26) PRIMARY KEY NOT NULL,
	"tenant_id" char(26) NOT NULL,
	"provider_id" char(26) NOT NULL,
	"product_type" "product_type" DEFAULT 'umrah' NOT NULL,
	"title" varchar(255) NOT NULL,
	"slug" varchar(255) NOT NULL,
	"category" "category" DEFAULT 'regular' NOT NULL,
	"plus_destination" varchar(120),
	"duration_days" integer,
	"description" text,
	"airline" varchar(120),
	"flight_route" varchar(255),
	"departure_city" varchar(120),
	"is_featured" boolean DEFAULT false NOT NULL,
	"status" "status" DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" char(26) PRIMARY KEY NOT NULL,
	"tenant_id" char(26) NOT NULL,
	"name" varchar(63) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "package_flyers" ADD CONSTRAINT "package_flyers_package_id_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."packages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "package_hotels" ADD CONSTRAINT "package_hotels_package_id_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."packages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "package_tags" ADD CONSTRAINT "package_tags_package_id_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."packages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "package_tags" ADD CONSTRAINT "package_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "packages" ADD CONSTRAINT "packages_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "packages" ADD CONSTRAINT "packages_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."providers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tags" ADD CONSTRAINT "tags_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;