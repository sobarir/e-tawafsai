import { Inject, Injectable, ConflictException, NotFoundException } from "@nestjs/common";
import { InjectPinoLogger, PinoLogger } from "nestjs-pino";
import { and, eq, ne, sql, type SQL } from "drizzle-orm";
import { ulid } from "ulid";
import { airlines, packages, type DbAirline, type Database } from "@cometkit/db";
import type { CreateAirlineInput, UpdateAirlineInput } from "@cometkit/shared";
import { TenantScopedDb } from "../tenancy/tenant-scoped-db";
import { DB } from "../database/database.module";
import { normalizeAirlineName } from "./airlines.policy";

@Injectable()
export class AirlinesService {
  constructor(
    private readonly tenantDb: TenantScopedDb,
    @Inject(DB) private readonly db: Database,
    @InjectPinoLogger(AirlinesService.name) private readonly logger: PinoLogger,
  ) {}

  async list(): Promise<DbAirline[]> {
    return (await this.tenantDb.select(airlines)) as DbAirline[];
  }

  async findById(id: string): Promise<DbAirline | undefined> {
    const [row] = await this.tenantDb.select(airlines, eq(airlines.id, id));
    return row as DbAirline | undefined;
  }

  private async assertNoNameConflict(name: string, excludeId?: string): Promise<void> {
    const match = eq(sql`lower(btrim(${airlines.name}))`, normalizeAirlineName(name)) as SQL;
    const where = excludeId ? (and(ne(airlines.id, excludeId), match) as SQL) : match;
    const [existing] = await this.tenantDb.select(airlines, where);
    if (existing) throw new ConflictException(`An airline named "${name}" already exists`);
  }

  private isUniqueViolation(err: unknown): boolean {
    const code = (e: unknown): string | undefined =>
      typeof e === "object" && e !== null ? (e as { code?: string }).code : undefined;
    if (code(err) === "23505") return true;
    const cause = typeof err === "object" && err !== null ? (err as { cause?: unknown }).cause : undefined;
    return code(cause) === "23505";
  }

  async create(input: CreateAirlineInput): Promise<DbAirline> {
    await this.assertNoNameConflict(input.name);
    try {
      const [row] = await this.tenantDb.insertValues(airlines, {
        id: ulid(),
        name: input.name,
        isActive: input.isActive ?? true,
      });
      if (!row) throw new Error("Insert returned no row");
      this.logger.info({ airlineId: (row as DbAirline).id }, "airline.created");
      return row as DbAirline;
    } catch (err) {
      if (this.isUniqueViolation(err)) throw new ConflictException(`An airline named "${input.name}" already exists`);
      throw err;
    }
  }

  async update(id: string, input: UpdateAirlineInput): Promise<DbAirline> {
    const existing = await this.findById(id);
    if (!existing) throw new NotFoundException("Airline not found");
    if (input.name && normalizeAirlineName(input.name) !== normalizeAirlineName(existing.name)) {
      await this.assertNoNameConflict(input.name, id);
    }
    try {
      const [row] = await this.tenantDb.update(airlines, { ...input }, eq(airlines.id, id));
      if (!row) throw new NotFoundException("Airline not found");
      this.logger.info({ airlineId: id }, "airline.updated");
      return row as DbAirline;
    } catch (err) {
      if (this.isUniqueViolation(err)) throw new ConflictException(`An airline named "${input.name}" already exists`);
      throw err;
    }
  }

  async remove(id: string): Promise<void> {
    const existing = await this.findById(id);
    if (!existing) throw new NotFoundException("Airline not found");
    const inUse = await this.db.$count(packages, eq(packages.airlineId, id));
    if (inUse > 0) {
      throw new ConflictException(`Airline is in use by ${inUse} package(s); deactivate it instead of deleting`);
    }
    await this.tenantDb.deleteFrom(airlines, eq(airlines.id, id));
    this.logger.info({ airlineId: id }, "airline.deleted");
  }
}
