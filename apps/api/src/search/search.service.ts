import { Inject, Injectable } from "@nestjs/common";
import { sql } from "drizzle-orm";
import { ConfigService } from "@nestjs/config";
import { PinoLogger, InjectPinoLogger } from "nestjs-pino";
import { DB } from "../database/database.module";
import { TenantScopedDb } from "../tenancy/tenant-scoped-db";
import { tenants, type Database } from "@cometkit/db";
import {
  packagePublicUrl,
  type Paginated,
  type SearchParams,
  type SearchResultDto,
} from "@cometkit/shared";

// Whitelist maps SearchParams.occupancy -> the departures price expression.
// Locked decision (C): non-quad occupancy falls back to price_quad when null.
// Keys come from the validated `occupancy` enum, so sql.raw is injection-safe here.
const OCC_COL: Record<SearchParams["occupancy"], string> = {
  quad: "d.price_quad",
  triple: "coalesce(d.price_triple, d.price_quad)",
  double: "coalesce(d.price_double, d.price_quad)",
};

interface SearchRow {
  id: string;
  title: string;
  slug: string;
  provider_name: string;
  provider_brand_name: string;
  ppiu_license_no: string | null;
  category: string | null;
  airline: string | null;
  next_departure_date: string | Date;
  price_from: number;
  seats_left: number;
  price_quad: number;
  price_triple: number | null;
  price_double: number | null;
  hotels: { cityName: string; name: string; stars: number; distanceM: number | null }[];
}

@Injectable()
export class SearchService {
  constructor(
    private readonly tenantDb: TenantScopedDb,
    @Inject(DB) private readonly db: Database,
    private readonly config: ConfigService,
    @InjectPinoLogger(SearchService.name) private readonly logger: PinoLogger,
  ) {}

  async search(params: SearchParams): Promise<Paginated<SearchResultDto>> {
    const tenantId = this.tenantDb.tenantId;
    const offset = (params.page - 1) * params.pageSize;

    // Resolve date window: explicit dateFrom/dateTo win; else month shorthands; else open range.
    const dateFrom = params.dateFrom ?? (params.monthFrom ? `${params.monthFrom}-01T00:00:00.000Z` : null);
    const dateTo = params.dateTo ?? (params.monthTo ? monthEndIso(params.monthTo) : null);

    const occExpr = sql.raw(OCC_COL[params.occupancy]);

    // Earliest matching departure carries date/seats/occupancy prices; price_from
    // is the MIN price_quad across ALL matching departures (design §3.2 "starting
    // from"), computed with a window so a cheaper later departure isn't over-quoted.
    // The INNER JOIN also enforces the "at least one matching departure" semantics.
    const depLateral = sql`
      join lateral (
        select departure_date, price_from, seats_left, price_quad, price_triple, price_double
        from (
          select d.departure_date,
                 (d.seat_total - d.seat_booked - d.seat_held) as seats_left,
                 d.price_quad, d.price_triple, d.price_double,
                 min(d.price_quad) over () as price_from
          from departures d
          where d.package_id = p.id
            and d.tenant_id = p.tenant_id
            and d.status in ('open','almost_full')
            and (${dateFrom}::timestamptz is null or d.departure_date >= ${dateFrom}::timestamptz)
            and (${dateTo}::timestamptz   is null or d.departure_date <= ${dateTo}::timestamptz)
            and (${params.seatsAvailableOnly} = false or (d.seat_total - d.seat_booked - d.seat_held) > 0)
            and (${params.maxPrice ?? null}::int is null or ${occExpr} <= ${params.maxPrice ?? null}::int)
        ) m
        order by m.departure_date asc
        limit 1
      ) nd on true`;

    const hotelLateral = sql`
      left join lateral (
        select coalesce(json_agg(json_build_object(
          'cityName', ph.city_name, 'name', ph.name,
          'stars', ph.stars, 'distanceM', ph.distance_m)), '[]'::json) as hotels
        from package_hotels ph where ph.package_id = p.id
      ) hj on true`;

    const filters = sql`
      p.tenant_id = ${tenantId}
      and p.status <> 'archived'
      and (${params.category ?? null}::text is null or pc.name = ${params.category ?? null})
      and (${params.productType ?? null}::text is null or p.product_type = ${params.productType ?? null})
      and (${params.airline ?? null}::text is null or p.airline = ${params.airline ?? null})
      and (${params.departureCity ?? null}::text is null or p.departure_city = ${params.departureCity ?? null})
      and (${params.providerId ?? null}::text is null or p.provider_id = ${params.providerId ?? null})
      and (${params.durationMin ?? null}::int is null or p.duration_days >= ${params.durationMin ?? null}::int)
      and (${params.durationMax ?? null}::int is null or p.duration_days <= ${params.durationMax ?? null}::int)
      and (${params.directOnly} = false or p.direct_only = true)
      and (${params.q ?? null}::text is null
           or p.search_doc @@ plainto_tsquery('simple', ${params.q ?? null})
           or exists (select 1 from package_hotels phq
                      where phq.package_id = p.id and phq.name ilike '%' || ${params.q ?? null} || '%'))
      and (${params.hotelCity ?? null}::text is null or exists (
            select 1 from package_hotels phc
            where phc.package_id = p.id
              and phc.city_name = ${params.hotelCity ?? null}
              and (${params.maxDistanceM ?? null}::int is null or phc.distance_m <= ${params.maxDistanceM ?? null}::int)
              and (${params.minStars ?? null}::int is null or phc.stars >= ${params.minStars ?? null}::int)))`;

    const rowsResult = await this.db.execute(sql`
      select p.id, p.title, p.slug, pc.name as category, p.airline,
             pr.name as provider_name, pr.brand_name as provider_brand_name,
             pr.ppiu_license_no,
             nd.departure_date as next_departure_date, nd.price_from, nd.seats_left,
             nd.price_quad, nd.price_triple, nd.price_double,
             hj.hotels
      from packages p
      join providers pr on pr.id = p.provider_id
      left join package_categories pc on pc.id = p.category_id
      ${depLateral}
      ${hotelLateral}
      where ${filters}
      order by nd.departure_date asc, p.id asc
      limit ${params.pageSize} offset ${offset}`);

    const countResult = await this.db.execute(sql`
      select count(*)::int as total
      from packages p
      join providers pr on pr.id = p.provider_id
      left join package_categories pc on pc.id = p.category_id
      ${depLateral}
      where ${filters}`);

    const rows = rowsResult as unknown as SearchRow[];
    const total = (countResult as unknown as { total: number }[])[0]?.total ?? 0;

    const [tenant] = await this.db.select().from(tenants).where(sql`${tenants.id} = ${tenantId}`).limit(1);
    const baseDomain = this.config.get<string>("PUBLIC_BASE_DOMAIN", "etawafsai.com");

    const data: SearchResultDto[] = rows.map((r) => ({
      id: r.id,
      title: r.title,
      slug: r.slug,
      providerName: r.provider_name,
      providerBrandName: r.provider_brand_name,
      ppiuLicenseNo: r.ppiu_license_no,
      category: r.category ?? null,
      airline: r.airline,
      nextDepartureDate: new Date(r.next_departure_date).toISOString(),
      priceFrom: r.price_from,
      priceByOccupancy: { quad: r.price_quad, triple: r.price_triple, double: r.price_double },
      seatsLeft: r.seats_left,
      hotels: r.hotels,
      publicUrl: packagePublicUrl(
        { slug: tenant!.slug, customDomain: tenant!.customDomain },
        r.slug,
        baseDomain,
      ),
    }));

    this.logger.info({ resultCount: data.length, total }, "search.executed");
    return {
      data,
      meta: {
        page: params.page,
        limit: params.pageSize,
        total,
        totalPages: Math.ceil(total / params.pageSize),
      },
    };
  }
}

function monthEndIso(month: string): string {
  const parts = month.split("-");
  const y = Number(parts[0]);
  const m = Number(parts[1]);
  return new Date(Date.UTC(y, m, 0, 23, 59, 59)).toISOString(); // day 0 of next month = last day of this month
}
