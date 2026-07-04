// Namespace import is required: under the vitest transform (SWC and Oxc
// alike) zod v4's named `import { z } from "zod"` resolves to an object
// whose `.object`/`.string` are undefined at runtime. `import * as z`
// binds the module namespace, whose top-level builders work correctly.
// Do not "simplify" this to a named import — it will break the tests.
import * as z from "zod";

export const TENANT_TYPES = ["agent", "ppiu"] as const;
export type TenantType = (typeof TENANT_TYPES)[number];

export const TENANT_PLANS = ["subscription", "revenue_share"] as const;
export type TenantPlan = (typeof TENANT_PLANS)[number];

export const TENANT_PLAN_STATUSES = [
  "trialing", "active", "past_due", "suspended", "cancelled",
] as const;
export type TenantPlanStatus = (typeof TENANT_PLAN_STATUSES)[number];

/** Well-known slug for the single Phase-1 tenant; resolved by slug, never by a hardcoded id. */
export const DEFAULT_TENANT_SLUG = "default";

const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Tenant creation contract. Phase 1 accepts only agent + subscription;
 * the other enum values stay defined as schema seams (PRD D4/D5).
 */
export const tenantInputSchema = z
  .object({
    name: z.string().min(1).max(120),
    slug: z.string().min(1).max(63).regex(slugRegex, "slug must be kebab-case"),
    tenantType: z.enum(TENANT_TYPES),
    plan: z.enum(TENANT_PLANS),
    planStatus: z.enum(TENANT_PLAN_STATUSES).default("active"),
    brandName: z.string().min(1).max(120),
    brandLogoUrl: z.url().max(2048).nullable().default(null),
    waNumber: z.string().max(32).nullable().default(null),
    customDomain: z.string().max(255).nullable().default(null),
  })
  .refine((v) => v.tenantType === "agent", {
    path: ["tenantType"],
    message: "Only 'agent' tenants are supported in Phase 1",
  })
  .refine((v) => v.plan === "subscription", {
    path: ["plan"],
    message: "Only the 'subscription' plan is supported in Phase 1",
  });
export type TenantInput = z.infer<typeof tenantInputSchema>;

/** The resolved active tenant carried in request context. */
export interface TenantContext {
  id: string;
  slug: string;
  tenantType: TenantType;
  plan: TenantPlan;
  planStatus: TenantPlanStatus;
  brandName: string;
}

/** Wire representation of a tenant. */
export interface TenantDto extends TenantContext {
  name: string;
  brandLogoUrl: string | null;
  waNumber: string | null;
  customDomain: string | null;
  createdAt: string;
  updatedAt: string;
}
