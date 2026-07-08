import * as z from "zod";

export const PRODUCT_TYPES = ["umrah", "haji_khusus", "haji_furoda"] as const;
export const PACKAGE_STATUSES = ["draft", "published", "archived"] as const;

export const createPackageSchema = z.object({
  title: z.string().min(1).max(255),
  providerId: z.string().length(26),
  productType: z.enum(PRODUCT_TYPES).default("umrah"),
  categoryId: z.string().length(26).nullable().optional(),
  plusDestination: z.string().max(120).nullable().optional(),
  durationDays: z.number().int().positive().nullable().optional(),
  description: z.string().nullable().optional(),
  airlineId: z.string().length(26).nullable().optional(),
  flightRoute: z.string().max(255).nullable().optional(),
  departureCityId: z.string().length(26).nullable().optional(),
  isFeatured: z.boolean().default(false),
  inclusions: z.array(z.string().length(26)).optional(),
  exclusions: z.array(z.string().length(26)).optional(),
});

export const updatePackageSchema = createPackageSchema.partial();

export const publishPackageSchema = z.object({
  durationDays: z.number().int().positive(),
  airlineId: z.string().length(26),
  departureCityId: z.string().length(26),
  categoryId: z.string().length(26),
});

export type CreatePackageInput = z.input<typeof createPackageSchema>;
export type UpdatePackageInput = z.input<typeof updatePackageSchema>;

export const createInclusionSchema = z.object({
  name: z.string().min(1).max(120),
  isActive: z.boolean().default(true),
});

export const updateInclusionSchema = createInclusionSchema.partial();

export const createExclusionSchema = z.object({
  name: z.string().min(1).max(120),
  isActive: z.boolean().default(true),
});

export const updateExclusionSchema = createExclusionSchema.partial();

export type CreateInclusionInput = z.infer<typeof createInclusionSchema>;
export type UpdateInclusionInput = z.infer<typeof updateInclusionSchema>;
export type CreateExclusionInput = z.infer<typeof createExclusionSchema>;
export type UpdateExclusionInput = z.infer<typeof updateExclusionSchema>;

export interface InclusionDto {
  id: string;
  tenantId: string;
  name: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ExclusionDto {
  id: string;
  tenantId: string;
  name: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// Attach input: reference a catalog hotel by id.
export interface HotelInput {
  hotelId: string;
}

// A hotel as it appears on a package: the catalog attributes joined in,
// plus the link id so a client can dedupe the picker and detach it.
export interface PackageHotelDto {
  hotelId: string;
  cityName: string;
  name: string;
  stars: number;
  distanceM: number | null;
  isPelataran: boolean;
}

export interface PackageInclusionDto {
  inclusionId: string;
  name: string;
  isActive: boolean;
}

export interface PackageExclusionDto {
  exclusionId: string;
  name: string;
  isActive: boolean;
}

export interface PackageDto {
  id: string;
  tenantId: string;
  providerId: string;
  productType: string;
  title: string;
  slug: string;
  categoryId: string | null;
  categoryName: string | null;
  plusDestination: string | null;
  durationDays: number | null;
  description: string | null;
  airlineId: string | null;
  airlineName: string | null;
  flightRoute: string | null;
  departureCityId: string | null;
  departureCityName: string | null;
  isFeatured: boolean;
  status: string;
  needsReview: boolean;
  hotels: PackageHotelDto[];
  inclusions: PackageInclusionDto[];
  exclusions: PackageExclusionDto[];
  flyers: string[];
  createdAt: string;
  updatedAt: string;
}

export type StaffPackageDto = PackageDto;
