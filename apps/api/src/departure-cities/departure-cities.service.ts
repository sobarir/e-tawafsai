import { Inject, Injectable, ConflictException, NotFoundException } from "@nestjs/common";
import { InjectPinoLogger, PinoLogger } from "nestjs-pino";
import { and, eq, ne, sql, type SQL } from "drizzle-orm";
import { ulid } from "ulid";
import { departureCities, packages, type DbDepartureCity, type Database } from "@cometkit/db";
import type { CreateDepartureCityInput, UpdateDepartureCityInput } from "@cometkit/shared";
import { TenantScopedDb } from "../tenancy/tenant-scoped-db";
import { DB } from "../database/database.module";
import { normalizeDepartureCityName } from "./departure-cities.policy";

@Injectable()
export class DepartureCitiesService {
  constructor(
    private readonly tenantDb: TenantScopedDb,
    @Inject(DB) private readonly db: Database,
    @InjectPinoLogger(DepartureCitiesService.name) private readonly logger: PinoLogger,
  ) {}

  async list(): Promise<DbDepartureCity[]> {
    return (await this.tenantDb.select(departureCities)) as DbDepartureCity[];
  }

  async findById(id: string): Promise<DbDepartureCity | undefined> {
    const [row] = await this.tenantDb.select(departureCities, eq(departureCities.id, id));
    return row as DbDepartureCity | undefined;
  }

  private async assertNoNameConflict(name: string, excludeId?: string): Promise<void> {
    const match = eq(sql`lower(btrim(${departureCities.name}))`, normalizeDepartureCityName(name)) as SQL;
    const where = excludeId ? (and(ne(departureCities.id, excludeId), match) as SQL) : match;
    const [existing] = await this.tenantDb.select(departureCities, where);
    if (existing) throw new ConflictException(`A departure city named "${name}" already exists`);
  }

  private isUniqueViolation(err: unknown): boolean {
    const code = (e: unknown): string | undefined =>
      typeof e === "object" && e !== null ? (e as { code?: string }).code : undefined;
    if (code(err) === "23505") return true;
    const cause = typeof err === "object" && err !== null ? (err as { cause?: unknown }).cause : undefined;
    return code(cause) === "23505";
  }

  async create(input: CreateDepartureCityInput): Promise<DbDepartureCity> {
    await this.assertNoNameConflict(input.name);
    try {
      const [row] = await this.tenantDb.insertValues(departureCities, {
        id: ulid(),
        name: input.name,
        isActive: input.isActive ?? true,
      });
      if (!row) throw new Error("Insert returned no row");
      this.logger.info({ departureCityId: (row as DbDepartureCity).id }, "departureCity.created");
      return row as DbDepartureCity;
    } catch (err) {
      if (this.isUniqueViolation(err)) throw new ConflictException(`A departure city named "${input.name}" already exists`);
      throw err;
    }
  }

  async update(id: string, input: UpdateDepartureCityInput): Promise<DbDepartureCity> {
    const existing = await this.findById(id);
    if (!existing) throw new NotFoundException("Departure city not found");
    if (input.name && normalizeDepartureCityName(input.name) !== normalizeDepartureCityName(existing.name)) {
      await this.assertNoNameConflict(input.name, id);
    }
    try {
      const [row] = await this.tenantDb.update(departureCities, { ...input }, eq(departureCities.id, id));
      if (!row) throw new NotFoundException("Departure city not found");
      this.logger.info({ departureCityId: id }, "departureCity.updated");
      return row as DbDepartureCity;
    } catch (err) {
      if (this.isUniqueViolation(err)) throw new ConflictException(`A departure city named "${input.name}" already exists`);
      throw err;
    }
  }

  async remove(id: string): Promise<void> {
    const existing = await this.findById(id);
    if (!existing) throw new NotFoundException("Departure city not found");
    const inUse = await this.db.$count(packages, eq(packages.departureCityId, id));
    if (inUse > 0) {
      throw new ConflictException(`Departure city is in use by ${inUse} package(s); deactivate it instead of deleting`);
    }
    await this.tenantDb.deleteFrom(departureCities, eq(departureCities.id, id));
    this.logger.info({ departureCityId: id }, "departureCity.deleted");
  }
}
