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

export interface HotelInput {
  cityName: string;
  name: string;
  stars: number;
  distanceM?: number | null;
  isPelataran: boolean;
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
  hotels: HotelInput[];
  tags: string[];
  flyers: string[];
  createdAt: string;
  updatedAt: string;
}

export type StaffPackageDto = PackageDto;
