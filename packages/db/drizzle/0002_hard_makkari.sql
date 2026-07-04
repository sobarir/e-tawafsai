CREATE TYPE "public"."tenant_plan" AS ENUM('subscription', 'revenue_share');--> statement-breakpoint
CREATE TYPE "public"."tenant_plan_status" AS ENUM('trialing', 'active', 'past_due', 'suspended', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."tenant_type" AS ENUM('agent', 'ppiu');--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" char(26) PRIMARY KEY NOT NULL,
	"name" varchar(120) NOT NULL,
	"slug" varchar(63) NOT NULL,
	"tenant_type" "tenant_type" DEFAULT 'agent' NOT NULL,
	"plan" "tenant_plan" DEFAULT 'subscription' NOT NULL,
	"plan_status" "tenant_plan_status" DEFAULT 'active' NOT NULL,
	"brand_name" varchar(120) NOT NULL,
	"brand_logo_url" varchar(2048),
	"wa_number" varchar(32),
	"custom_domain" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenants_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
-- Seed the default tenant with a stable sentinel id (26-char ULID form).
-- Application code resolves this tenant by slug 'default', never by this id.
INSERT INTO "tenants" ("id","name","slug","tenant_type","plan","plan_status","brand_name")
VALUES ('00000000000000000000000000','Default Tenant','default','agent','subscription','active','Default Tenant')
ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
-- users: add tenant_id nullable -> backfill -> enforce NOT NULL + FK.
ALTER TABLE "users" ADD COLUMN "tenant_id" char(26);--> statement-breakpoint
UPDATE "users" SET "tenant_id" = '00000000000000000000000000' WHERE "tenant_id" IS NULL;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "tenant_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "is_platform_owner" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- Swap global email unique for per-tenant composite unique.
ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_email_unique";--> statement-breakpoint
CREATE UNIQUE INDEX "users_tenant_email_unique" ON "users" USING btree ("tenant_id","email");
