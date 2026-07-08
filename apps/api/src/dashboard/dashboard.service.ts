import { Inject, Injectable } from "@nestjs/common";
import { sql } from "drizzle-orm";
import { PinoLogger, InjectPinoLogger } from "nestjs-pino";
import type { Database } from "@cometkit/db";
import type { DashboardSummaryDto, DepartureSignal } from "@cometkit/shared";
import { DB } from "../database/database.module";
import { TenantScopedDb } from "../tenancy/tenant-scoped-db";

/** Raw departure-signal row from the urgent-closing / needs-push queries. */
export interface DepartureRow {
  departure_id: string;
  package_id: string;
  package_title: string;
  departure_date: string | Date;
  seats_left: number;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** UTC midnight (date-only) of a timestamp, in ms. */
function utcMidnight(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/**
 * Calendar days from `now` until `date` (H-N style): same calendar day = 0, next day = 1.
 * Clamped to >= 0 so past departures never report negative.
 */
export function daysUntil(date: Date, now: Date): number {
  return Math.max(0, Math.round((utcMidnight(date) - utcMidnight(now)) / MS_PER_DAY));
}

export function toDepartureSignal(row: DepartureRow): DepartureSignal {
  return {
    departureId: row.departure_id,
    packageId: row.package_id,
    packageTitle: row.package_title,
    departureDate: new Date(row.departure_date).toISOString(),
    seatsLeft: row.seats_left,
  };
}

@Injectable()
export class DashboardService {
  constructor(
    private readonly tenantDb: TenantScopedDb,
    @Inject(DB) private readonly db: Database,
    @InjectPinoLogger(DashboardService.name) private readonly logger: PinoLogger,
  ) {}

  async summary(): Promise<DashboardSummaryDto> {
    const tenantId = this.tenantDb.tenantId;

    const [pkgCounts] = (await this.db.execute(sql`
      select count(*)::int as total,
             count(*) filter (where status = 'published')::int as published,
             count(*) filter (where status = 'draft')::int as draft
      from packages where tenant_id = ${tenantId}`)) as unknown as {
      total: number; published: number; draft: number;
    }[];

    const [depCounts] = (await this.db.execute(sql`
      select
        count(*) filter (where status in ('open','almost_full') and departure_date >= now())::int as upcoming,
        count(*) filter (where status = 'almost_full')::int as almost_full,
        coalesce(sum(seat_total - seat_booked - seat_held)
          filter (where status in ('open','almost_full') and departure_date >= now()), 0)::int as open_seats
      from departures where tenant_id = ${tenantId}`)) as unknown as {
      upcoming: number; almost_full: number; open_seats: number;
    }[];

    const [provCounts] = (await this.db.execute(sql`
      select count(*)::int as total, count(*) filter (where is_active)::int as active
      from providers where tenant_id = ${tenantId}`)) as unknown as {
      total: number; active: number;
    }[];

    const urgentRows = (await this.db.execute(sql`
      select d.id as departure_id, p.id as package_id, p.title as package_title,
             d.departure_date, (d.seat_total - d.seat_booked - d.seat_held) as seats_left
      from departures d join packages p on p.id = d.package_id
      where d.tenant_id = ${tenantId} and d.status = 'almost_full'
      order by d.departure_date asc
      limit 10`)) as unknown as DepartureRow[];

    const needsPushRows = (await this.db.execute(sql`
      select d.id as departure_id, p.id as package_id, p.title as package_title,
             d.departure_date, (d.seat_total - d.seat_booked - d.seat_held) as seats_left
      from departures d join packages p on p.id = d.package_id
      where d.tenant_id = ${tenantId}
        and d.status in ('open','almost_full')
        and d.departure_date >= now()
        and d.departure_date <= now() + interval '45 days'
        and (d.seat_total - d.seat_booked - d.seat_held) > 0
      order by d.departure_date asc
      limit 10`)) as unknown as DepartureRow[];

    const recentRows = (await this.db.execute(sql`
      select id, title, status, updated_at
      from packages where tenant_id = ${tenantId}
      order by updated_at desc
      limit 5`)) as unknown as {
      id: string; title: string; status: string; updated_at: string | Date;
    }[];

    const now = new Date();
    const summary: DashboardSummaryDto = {
      packages: {
        total: pkgCounts?.total ?? 0,
        published: pkgCounts?.published ?? 0,
        draft: pkgCounts?.draft ?? 0,
      },
      departures: {
        upcoming: depCounts?.upcoming ?? 0,
        almostFull: depCounts?.almost_full ?? 0,
        openSeats: depCounts?.open_seats ?? 0,
      },
      providers: {
        total: provCounts?.total ?? 0,
        active: provCounts?.active ?? 0,
      },
      urgentClosing: urgentRows.map(toDepartureSignal),
      needsPush: needsPushRows.map((r) => ({
        ...toDepartureSignal(r),
        daysUntil: daysUntil(new Date(r.departure_date), now),
      })),
      recentPackages: recentRows.map((r) => ({
        id: r.id,
        title: r.title,
        status: r.status,
        updatedAt: new Date(r.updated_at).toISOString(),
      })),
    };

    this.logger.info(
      { packages: summary.packages.total, upcoming: summary.departures.upcoming },
      "dashboard.summary.read",
    );
    return summary;
  }
}
