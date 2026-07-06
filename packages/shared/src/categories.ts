import * as z from "zod";
import { COMMISSION_TYPES } from "./providers";
import { PRODUCT_TYPES } from "./packages";

/** Seed names bootstrapped per provider from the retired fixed category enum. */
export const LEGACY_CATEGORY_NAMES = [
  "Regular", "Plus", "Private VIP", "Ramadan", "Arbain", "Other",
] as const;

export const createCategorySchema = z.object({
  providerId: z.string().length(26),
  productType: z.enum(PRODUCT_TYPES).default("umrah"),
  name: z.string().min(1).max(120),
  commissionType: z.enum(COMMISSION_TYPES).optional(),
  commissionValue: z.number().int().nonnegative().optional(),
});

export const updateCategorySchema = z.object({
  name: z.string().min(1).max(120).optional(),
  commissionType: z.enum(COMMISSION_TYPES).optional(),
  commissionValue: z.number().int().nonnegative().optional(),
});

export type CreateCategoryInput = z.input<typeof createCategorySchema>;
export type UpdateCategoryInput = z.input<typeof updateCategorySchema>;

export interface CategoryDto {
  id: string;
  tenantId: string;
  providerId: string;
  productType: string;
  name: string;
  commissionType: string;
  commissionValue: number;
  createdAt: string;
  updatedAt: string;
}

/** Staff-safe projection: commission stripped. */
export type StaffCategoryDto = Omit<CategoryDto, "commissionType" | "commissionValue">;
