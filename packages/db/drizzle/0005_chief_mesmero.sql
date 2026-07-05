CREATE TYPE "public"."accreditation" AS ENUM('A', 'B', 'C', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."commission_type" AS ENUM('flat_per_pax', 'percent_of_price');--> statement-breakpoint
CREATE TABLE "providers" (
	"id" char(26) PRIMARY KEY NOT NULL,
	"tenant_id" char(26) NOT NULL,
	"name" varchar(255) NOT NULL,
	"brand_name" varchar(255) NOT NULL,
	"ppiu_license_no" varchar(100),
	"pihk_license_no" varchar(100),
	"accreditation" "accreditation" DEFAULT 'unknown' NOT NULL,
	"contact_person" varchar(255) NOT NULL,
	"contact_phone" varchar(32) NOT NULL,
	"logo_url" varchar(2048),
	"allow_logo_on_public_pages" boolean DEFAULT false NOT NULL,
	"default_commission_type" "commission_type" DEFAULT 'flat_per_pax' NOT NULL,
	"default_commission_value" integer DEFAULT 0 NOT NULL,
	"commission_notes" text,
	"is_active" boolean DEFAULT false NOT NULL,
	"price_publication_consent_at" timestamp,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "providers" ADD CONSTRAINT "providers_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;