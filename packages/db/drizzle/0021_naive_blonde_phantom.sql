CREATE TABLE "exclusions" (
	"id" char(26) PRIMARY KEY NOT NULL,
	"tenant_id" char(26) NOT NULL,
	"name" varchar(120) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inclusions" (
	"id" char(26) PRIMARY KEY NOT NULL,
	"tenant_id" char(26) NOT NULL,
	"name" varchar(120) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "package_exclusions" (
	"package_id" char(26) NOT NULL,
	"exclusion_id" char(26) NOT NULL,
	CONSTRAINT "package_exclusions_package_id_exclusion_id_pk" PRIMARY KEY("package_id","exclusion_id")
);
--> statement-breakpoint
CREATE TABLE "package_inclusions" (
	"package_id" char(26) NOT NULL,
	"inclusion_id" char(26) NOT NULL,
	CONSTRAINT "package_inclusions_package_id_inclusion_id_pk" PRIMARY KEY("package_id","inclusion_id")
);
--> statement-breakpoint
ALTER TABLE "exclusions" ADD CONSTRAINT "exclusions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inclusions" ADD CONSTRAINT "inclusions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "package_exclusions" ADD CONSTRAINT "package_exclusions_package_id_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."packages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "package_exclusions" ADD CONSTRAINT "package_exclusions_exclusion_id_exclusions_id_fk" FOREIGN KEY ("exclusion_id") REFERENCES "public"."exclusions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "package_inclusions" ADD CONSTRAINT "package_inclusions_package_id_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."packages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "package_inclusions" ADD CONSTRAINT "package_inclusions_inclusion_id_inclusions_id_fk" FOREIGN KEY ("inclusion_id") REFERENCES "public"."inclusions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "exclusions_tenant_name_idx" ON "exclusions" USING btree ("tenant_id",lower(btrim("name")));--> statement-breakpoint
CREATE UNIQUE INDEX "inclusions_tenant_name_idx" ON "inclusions" USING btree ("tenant_id",lower(btrim("name")));