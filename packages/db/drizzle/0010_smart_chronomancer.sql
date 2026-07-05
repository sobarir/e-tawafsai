CREATE TYPE "public"."currency_type" AS ENUM('IDR', 'USD');--> statement-breakpoint
CREATE TYPE "public"."departure_status" AS ENUM('open', 'almost_full', 'full', 'departed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."departure_type" AS ENUM('fixed_date', 'estimated_year');--> statement-breakpoint
CREATE TABLE "departures" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"package_id" text NOT NULL,
	"departure_type" "departure_type" DEFAULT 'fixed_date' NOT NULL,
	"departure_date" timestamp NOT NULL,
	"return_date" timestamp NOT NULL,
	"seat_total" integer NOT NULL,
	"seat_booked" integer DEFAULT 0 NOT NULL,
	"seat_held" integer DEFAULT 0 NOT NULL,
	"currency" "currency_type" DEFAULT 'IDR' NOT NULL,
	"price_quad" integer NOT NULL,
	"price_triple" integer,
	"price_double" integer,
	"dp_amount" integer NOT NULL,
	"payment_schedule" text NOT NULL,
	"status" "departure_status" DEFAULT 'open' NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "seat_invariant" CHECK ("departures"."seat_total" - "departures"."seat_booked" - "departures"."seat_held" >= 0)
);
--> statement-breakpoint
CREATE TABLE "inventory_adjustments" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"departure_id" text NOT NULL,
	"delta" integer NOT NULL,
	"reason" text NOT NULL,
	"actor_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "departures" ADD CONSTRAINT "departures_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "departures" ADD CONSTRAINT "departures_package_id_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."packages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_adjustments" ADD CONSTRAINT "inventory_adjustments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_adjustments" ADD CONSTRAINT "inventory_adjustments_departure_id_departures_id_fk" FOREIGN KEY ("departure_id") REFERENCES "public"."departures"("id") ON DELETE no action ON UPDATE no action;