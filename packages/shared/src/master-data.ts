import * as z from "zod";

export const createAirlineSchema = z.object({
  name: z.string().min(1).max(120),
  isActive: z.boolean().default(true),
});
export const updateAirlineSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  isActive: z.boolean().optional(),
});

// Departure city shares the exact same shape as airline.
export const createDepartureCitySchema = createAirlineSchema;
export const updateDepartureCitySchema = updateAirlineSchema;

export type CreateAirlineInput = z.input<typeof createAirlineSchema>;
export type UpdateAirlineInput = z.input<typeof updateAirlineSchema>;
export type CreateDepartureCityInput = z.input<typeof createDepartureCitySchema>;
export type UpdateDepartureCityInput = z.input<typeof updateDepartureCitySchema>;

interface MasterRowDto {
  id: string;
  tenantId: string;
  name: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}
export type AirlineDto = MasterRowDto;
export type DepartureCityDto = MasterRowDto;
