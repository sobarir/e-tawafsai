import * as z from "zod";

export const createHotelSchema = z.object({
  name: z.string().min(1).max(120),
  city: z.string().min(1).max(120),
  stars: z.number().int().min(1).max(5).default(3),
  distanceM: z.number().int().nonnegative().nullable().optional(),
  isPelataran: z.boolean().default(false),
  isActive: z.boolean().default(true),
});

export const updateHotelSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  city: z.string().min(1).max(120).optional(),
  stars: z.number().int().min(1).max(5).optional(),
  distanceM: z.number().int().nonnegative().nullable().optional(),
  isPelataran: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

// Attach input: reference a catalog hotel by id (posted to :id/hotels).
export const attachHotelSchema = z.object({ hotelId: z.string().length(26) });

export type CreateHotelInput = z.input<typeof createHotelSchema>;
export type UpdateHotelInput = z.input<typeof updateHotelSchema>;

export interface HotelDto {
  id: string;
  tenantId: string;
  name: string;
  city: string;
  stars: number;
  distanceM: number | null;
  isPelataran: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}
