import * as z from "zod";
import { PACKAGE_CATEGORIES, PRODUCT_TYPES } from "./packages";

export const OCCUPANCIES = ["quad", "triple", "double"] as const;
export type Occupancy = (typeof OCCUPANCIES)[number];

export const HOTEL_CITIES = ["Makkah", "Madinah"] as const;
export type HotelCity = (typeof HOTEL_CITIES)[number];

/**
 * Query-string safe boolean: real booleans pass through; the strings "true"/"1"
 * are true and "false"/"0"/"" are false. Plain `z.coerce.boolean()` is wrong here
 * because it maps any non-empty string (including "false") to true.
 */
const queryBoolean = (defaultValue: boolean) =>
  z
    .union([z.boolean(), z.enum(["true", "false", "1", "0", ""])])
    .transform((v) => (typeof v === "boolean" ? v : v === "true" || v === "1"))
    .default(defaultValue);

export const searchPackagesSchema = z.object({
  // full-text
  q: z.string().trim().min(1).max(120).optional(),
  // price + occupancy
  maxPrice: z.coerce.number().int().positive().optional(),
  occupancy: z.enum(OCCUPANCIES).default("quad"),
  // departure date window (ISO datetime); month* accepted as YYYY-MM shorthand
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
  monthFrom: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  monthTo: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  // duration
  durationMin: z.coerce.number().int().positive().optional(),
  durationMax: z.coerce.number().int().positive().optional(),
  // structured catalog filters
  category: z.enum(PACKAGE_CATEGORIES).optional(),
  productType: z.enum(PRODUCT_TYPES).optional(),
  airline: z.string().max(120).optional(),
  departureCity: z.string().max(120).optional(),
  providerId: z.string().length(26).optional(),
  directOnly: queryBoolean(false),
  // hotel filters
  hotelCity: z.enum(HOTEL_CITIES).optional(),
  maxDistanceM: z.coerce.number().int().positive().optional(),
  minStars: z.coerce.number().int().min(1).max(5).optional(),
  // inventory
  seatsAvailableOnly: queryBoolean(false),
  // pagination
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

export type SearchParams = z.infer<typeof searchPackagesSchema>;

export interface SearchResultDto {
  id: string;
  title: string;
  slug: string;
  providerName: string;
  providerBrandName: string; // for the WhatsApp summary
  ppiuLicenseNo: string | null; // for the WhatsApp summary
  category: string;
  airline: string | null;
  nextDepartureDate: string; // ISO — earliest matching departure
  priceFrom: number; // min priceQuad among matching departures
  priceByOccupancy: { quad: number; triple: number | null; double: number | null };
  seatsLeft: number; // seats of the next matching departure
  hotels: { cityName: string; name: string; stars: number; distanceM: number | null }[];
  publicUrl: string; // server-computed via packagePublicUrl (build-time decision 1)
}

function formatIdr(amount: number): string {
  return "Rp " + amount.toLocaleString("id-ID");
}

function formatDateId(iso: string): string {
  return new Date(iso).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/**
 * Deterministic plain-text WhatsApp block. Pure — reused verbatim by C8/C21.
 * Legality line follows locked decision (D): the "— PPIU SK …" clause is
 * dropped when ppiuLicenseNo is null.
 */
export function formatWhatsappSummary(dto: SearchResultDto): string {
  const priceLines: string[] = [`- Quad: ${formatIdr(dto.priceByOccupancy.quad)}`];
  if (dto.priceByOccupancy.triple !== null) {
    priceLines.push(`- Triple: ${formatIdr(dto.priceByOccupancy.triple)}`);
  }
  if (dto.priceByOccupancy.double !== null) {
    priceLines.push(`- Double: ${formatIdr(dto.priceByOccupancy.double)}`);
  }

  const hotelLines = dto.hotels.map((h) => {
    const dist = h.distanceM !== null ? ` (${h.distanceM} m)` : "";
    return `- ${h.cityName}: ${h.name} ${"★".repeat(h.stars)}${dist}`;
  });

  const legality =
    dto.ppiuLicenseNo !== null
      ? `Diselenggarakan oleh ${dto.providerBrandName} — PPIU SK ${dto.ppiuLicenseNo}`
      : `Diselenggarakan oleh ${dto.providerBrandName}`;

  return [
    `*${dto.title}*`,
    `Keberangkatan: ${formatDateId(dto.nextDepartureDate)}`,
    `Maskapai: ${dto.airline ?? "-"}`,
    "",
    "Harga:",
    ...priceLines,
    "",
    "Hotel:",
    ...hotelLines,
    "",
    `Sisa kursi: ${dto.seatsLeft}`,
    dto.publicUrl,
    "",
    legality,
  ].join("\n");
}
