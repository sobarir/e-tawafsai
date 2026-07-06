CREATE TABLE "package_categories" (
	"id" char(26) PRIMARY KEY NOT NULL,
	"tenant_id" char(26) NOT NULL,
	"provider_id" char(26) NOT NULL,
	"product_type" "product_type" DEFAULT 'umrah' NOT NULL,
	"name" varchar(120) NOT NULL,
	"commission_type" "commission_type" DEFAULT 'flat_per_pax' NOT NULL,
	"commission_value" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "packages" ADD COLUMN "category_id" char(26);--> statement-breakpoint
ALTER TABLE "package_categories" ADD CONSTRAINT "package_categories_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "package_categories" ADD CONSTRAINT "package_categories_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."providers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "package_categories_scope_name_idx" ON "package_categories" USING btree ("tenant_id","provider_id","product_type",lower(btrim("name")));--> statement-breakpoint
CREATE INDEX "package_categories_provider_idx" ON "package_categories" USING btree ("provider_id");--> statement-breakpoint
ALTER TABLE "packages" ADD CONSTRAINT "packages_category_id_package_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."package_categories"("id") ON DELETE no action ON UPDATE no action;