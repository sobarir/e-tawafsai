/**
 * Admin dashboard summary contract.
 *
 * Aggregated, tenant-scoped operational snapshot for the admin home, computed from
 * existing entities (packages, departures, providers). No new persisted shapes.
 */

export interface DepartureSignal {
  departureId: string;
  packageId: string;
  packageTitle: string;
  departureDate: string;
  seatsLeft: number;
}

export interface RecentPackage {
  id: string;
  title: string;
  status: string;
  updatedAt: string;
}

export interface DashboardSummaryDto {
  packages: { total: number; published: number; draft: number };
  departures: { upcoming: number; almostFull: number; openSeats: number };
  providers: { total: number; active: number };
  /** Departures flagged almost_full — "urgent closing". */
  urgentClosing: DepartureSignal[];
  /** Open/almost-full departures within the next 45 days with seats left — "needs push". */
  needsPush: (DepartureSignal & { daysUntil: number })[];
  recentPackages: RecentPackage[];
}
