import { Inject, Injectable } from "@nestjs/common";
import { sql } from "drizzle-orm";
import { PinoLogger, InjectPinoLogger } from "nestjs-pino";
import type { Database } from "@cometkit/db";
import type { PublicPackageCardDto } from "@cometkit/shared";
import { DB } from "../database/database.module";
import { TenantScopedDb } from "../tenancy/tenant-scoped-db";
import { toPublicPackageCardDto, type PublicPackageRow } from "./public-packages.mapper";

@Injectable()
export class PublicPackagesService {
  constructor(
    private readonly tenantDb: TenantScopedDb,
    @Inject(DB) private readonly db: Database,
    @InjectPinoLogger(PublicPackagesService.name) private readonly logger: PinoLogger,
  ) {}

  /**
   * Published packages for the current (host-resolved) tenant, featured first then most
   * recent. LEFT joins so a published package without an upcoming departure still shows
   * (null date/price, 0 seats). Only marketing-safe fields leave via the mapper.
   */
  async featured(limit = 6): Promise<PublicPackageCardDto[]> {
    const tenantId = this.tenantDb.tenantId;

    // Earliest UPCOMING departure carries date/seats; price_from is the MIN quad price
    // across upcoming departures (window), so a cheaper later departure isn't over-quoted.
    const depLateral = sql`
      left join lateral (
        select departure_date, seats_left, price_from
        from (
          select d.departure_date,
                 (d.seat_total - d.seat_booked - d.seat_held) as seats_left,
                 min(d.price_quad) over () as price_from
          from departures d
          where d.package_id = p.id
            and d.tenant_id = p.tenant_id
            and d.status in ('open','almost_full')
            and d.departure_date >= now()
        ) m
        order by m.departure_date asc
        limit 1
      ) nd on true`;

    const hotelLateral = sql`
      left join lateral (
        select coalesce(json_agg(json_build_object(
          'cityName', h.city, 'name', h.name, 'stars', h.stars,
          'distanceM', h.distance_m, 'isPelataran', h.is_pelataran)), '[]'::json) as hotels
        from package_hotels ph join hotels h on h.id = ph.hotel_id
        where ph.package_id = p.id
      ) hj on true`;

    const rowsResult = await this.db.execute(sql`
      select p.title, p.slug, pc.name as category, la.name as airline,
             nd.departure_date as next_departure_date, nd.price_from,
             coalesce(nd.seats_left, 0) as seats_left,
             hj.hotels
      from packages p
      left join package_categories pc on pc.id = p.category_id
      left join airlines la on la.id = p.airline_id
      ${depLateral}
      ${hotelLateral}
      where p.tenant_id = ${tenantId}
        and p.status = 'published'
      order by p.is_featured desc, p.created_at desc
      limit ${limit}`);

    const rows = rowsResult as unknown as PublicPackageRow[];
    const data = rows.map(toPublicPackageCardDto);
    this.logger.info({ count: data.length }, "public.packages.listed");
    return data;
  }
}
