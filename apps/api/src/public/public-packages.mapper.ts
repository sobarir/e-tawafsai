import type { PublicPackageCardDto, PublicPackageHotel } from "@cometkit/shared";

/**
 * Raw row shape returned by the public packages SQL. Snake_case mirrors the
 * `search.service` row convention; `hotels` is already the marketing-safe json agg.
 */
export interface PublicPackageRow {
  title: string;
  slug: string;
  category: string | null;
  airline: string | null;
  hotels: PublicPackageHotel[];
  next_departure_date: string | Date | null;
  price_from: number | null;
  seats_left: number;
}

/**
 * Map a raw published-package row to the marketing-safe public DTO. This mapper is the
 * single place public field exposure is decided — adding an internal field to the
 * response requires editing here.
 */
export function toPublicPackageCardDto(row: PublicPackageRow): PublicPackageCardDto {
  return {
    title: row.title,
    slug: row.slug,
    category: row.category,
    airline: row.airline,
    hotels: row.hotels,
    nearestDepartureDate:
      row.next_departure_date == null ? null : new Date(row.next_departure_date).toISOString(),
    startingPriceIdr: row.price_from,
    seatsAvailable: row.seats_left,
  };
}
