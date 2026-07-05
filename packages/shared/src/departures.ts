import * as z from "zod";

export const DEPARTURE_TYPES = ["fixed_date", "estimated_year"] as const;
export const DEPARTURE_STATUSES = ["open", "almost_full", "full", "departed", "cancelled"] as const;
export const CURRENCIES = ["IDR", "USD"] as const;

export interface PaymentMilestone {
  name: string;
  amount: number;
  daysBeforeDeparture: number;
}

export const createDepartureSchema = z.object({
  packageId: z.string().length(26),
  departureType: z.enum(DEPARTURE_TYPES).default("fixed_date"),
  departureDate: z.string().datetime(),
  returnDate: z.string().datetime(),
  seatTotal: z.number().int().positive(),
  currency: z.enum(CURRENCIES).default("IDR"),
  priceQuad: z.number().int().positive(),
  priceTriple: z.number().int().positive().nullable().optional(),
  priceDouble: z.number().int().positive().nullable().optional(),
  dpAmount: z.number().int().positive(),
  paymentSchedule: z.array(
    z.object({
      name: z.string().min(1),
      amount: z.number().int().positive(),
      daysBeforeDeparture: z.number().int().positive(),
    })
  ).min(1),
  notes: z.string().nullable().optional(),
});

export const updateDepartureSchema = createDepartureSchema.partial();

export type CreateDepartureInput = z.input<typeof createDepartureSchema>;
export type UpdateDepartureInput = z.input<typeof updateDepartureSchema>;

export interface DepartureDto {
  id: string;
  tenantId: string;
  packageId: string;
  departureType: string;
  departureDate: string;
  returnDate: string;
  seatTotal: number;
  seatBooked: number;
  seatHeld: number;
  seatAvailable: number;
  currency: string;
  priceQuad: number;
  priceTriple: number | null;
  priceDouble: number | null;
  dpAmount: number;
  paymentSchedule: PaymentMilestone[];
  status: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface InventoryAdjustmentDto {
  id: string;
  tenantId: string;
  departureId: string;
  delta: number;
  reason: string;
  actorId: string;
  createdAt: string;
}
