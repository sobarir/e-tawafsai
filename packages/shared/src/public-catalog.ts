/**
 * Public (unauthenticated) landing-page catalog contract.
 *
 * Marketing-safe projection of a published package for the consumer landing page.
 * Deliberately excludes internal fields (commission, category internals, deposit/
 * pricing internals, internal provider identifiers). The API builds this via a typed
 * mapper so field exposure is explicit and drift is a compile error.
 */

export interface PublicPackageHotel {
  cityName: string;
  name: string;
  stars: number;
  distanceM: number | null;
  isPelataran: boolean;
}

export interface PublicPackageCardDto {
  title: string;
  slug: string;
  category: string | null;
  airline: string | null;
  hotels: PublicPackageHotel[];
  /** ISO date of the nearest upcoming departure, or null when none. */
  nearestDepartureDate: string | null;
  /** Min quad price across upcoming departures, or null when none. */
  startingPriceIdr: number | null;
  /** Seats left on the nearest departure; 0 when there is no upcoming departure. */
  seatsAvailable: number;
}
