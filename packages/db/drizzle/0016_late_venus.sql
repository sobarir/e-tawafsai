INSERT INTO "package_categories" ("id", "tenant_id", "provider_id", "product_type", "name", "commission_type", "commission_value", "created_at", "updated_at")
SELECT DISTINCT ON (p."tenant_id", p."provider_id", p."product_type", p."category")
	upper(substr(md5(p."tenant_id" || p."provider_id" || p."product_type"::text || p."category"::text), 1, 26)),
	p."tenant_id",
	p."provider_id",
	p."product_type",
	CASE p."category"
		WHEN 'regular' THEN 'Regular'
		WHEN 'plus' THEN 'Plus'
		WHEN 'private_vip' THEN 'Private VIP'
		WHEN 'ramadan' THEN 'Ramadan'
		WHEN 'arbain' THEN 'Arbain'
		WHEN 'other' THEN 'Other'
	END,
	pr."default_commission_type",
	pr."default_commission_value",
	now(),
	now()
FROM "packages" p
JOIN "providers" pr ON pr."id" = p."provider_id"
WHERE p."category_id" IS NULL
ON CONFLICT DO NOTHING;--> statement-breakpoint
UPDATE "packages" p SET "category_id" = pc."id"
FROM "package_categories" pc
WHERE p."category_id" IS NULL
	AND pc."tenant_id" = p."tenant_id"
	AND pc."provider_id" = p."provider_id"
	AND pc."product_type" = p."product_type"
	AND lower(btrim(pc."name")) = lower(CASE p."category"
		WHEN 'regular' THEN 'Regular'
		WHEN 'plus' THEN 'Plus'
		WHEN 'private_vip' THEN 'Private VIP'
		WHEN 'ramadan' THEN 'Ramadan'
		WHEN 'arbain' THEN 'Arbain'
		WHEN 'other' THEN 'Other'
	END);--> statement-breakpoint
ALTER TABLE "packages" DROP COLUMN "category";--> statement-breakpoint
DROP TYPE "public"."category";