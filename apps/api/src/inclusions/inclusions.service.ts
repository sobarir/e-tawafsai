import { Inject, Injectable, ConflictException, NotFoundException } from "@nestjs/common";
import { InjectPinoLogger, PinoLogger } from "nestjs-pino";
import { and, eq, ne, sql, type SQL } from "drizzle-orm";
import { ulid } from "ulid";
import { inclusions, packageInclusions, type DbInclusion, type Database } from "@cometkit/db";
import type { CreateInclusionInput, UpdateInclusionInput } from "@cometkit/shared";
import { TenantScopedDb } from "../tenancy/tenant-scoped-db";
import { DB } from "../database/database.module";
import { normalizeInclusionName } from "./inclusions.policy";

@Injectable()
export class InclusionsService {
  constructor(
    private readonly tenantDb: TenantScopedDb,
    @Inject(DB) private readonly db: Database,
    @InjectPinoLogger(InclusionsService.name) private readonly logger: PinoLogger,
  ) {}

  async list(): Promise<DbInclusion[]> {
    return (await this.tenantDb.select(inclusions)) as DbInclusion[];
  }

  async findById(id: string): Promise<DbInclusion | undefined> {
    const [row] = await this.tenantDb.select(inclusions, eq(inclusions.id, id));
    return row as DbInclusion | undefined;
  }

  private async assertNoNameConflict(name: string, excludeId?: string): Promise<void> {
    const match = eq(sql`lower(btrim(${inclusions.name}))`, normalizeInclusionName(name)) as SQL;
    const where = excludeId ? (and(ne(inclusions.id, excludeId), match) as SQL) : match;
    const [existing] = await this.tenantDb.select(inclusions, where);
    if (existing) throw new ConflictException(`An inclusion named "${name}" already exists`);
  }

  private isUniqueViolation(err: unknown): boolean {
    const code = (e: unknown): string | undefined =>
      typeof e === "object" && e !== null ? (e as { code?: string }).code : undefined;
    if (code(err) === "23505") return true;
    const cause = typeof err === "object" && err !== null ? (err as { cause?: unknown }).cause : undefined;
    return code(cause) === "23505";
  }

  async create(input: CreateInclusionInput): Promise<DbInclusion> {
    await this.assertNoNameConflict(input.name);
    try {
      const [row] = await this.tenantDb.insertValues(inclusions, {
        id: ulid(),
        name: input.name,
        isActive: input.isActive ?? true,
      });
      if (!row) throw new Error("Insert returned no row");
      this.logger.info({ inclusionId: (row as DbInclusion).id }, "inclusion.created");
      return row as DbInclusion;
    } catch (err) {
      if (this.isUniqueViolation(err)) throw new ConflictException(`An inclusion named "${input.name}" already exists`);
      throw err;
    }
  }

  async update(id: string, input: UpdateInclusionInput): Promise<DbInclusion> {
    const existing = await this.findById(id);
    if (!existing) throw new NotFoundException("Inclusion not found");
    if (input.name && normalizeInclusionName(input.name) !== normalizeInclusionName(existing.name)) {
      await this.assertNoNameConflict(input.name, id);
    }
    try {
      const [row] = await this.tenantDb.update(inclusions, { ...input }, eq(inclusions.id, id));
      if (!row) throw new NotFoundException("Inclusion not found");
      this.logger.info({ inclusionId: id }, "inclusion.updated");
      return row as DbInclusion;
    } catch (err) {
      if (this.isUniqueViolation(err)) throw new ConflictException(`An inclusion named "${input.name}" already exists`);
      throw err;
    }
  }

  async remove(id: string): Promise<void> {
    const existing = await this.findById(id);
    if (!existing) throw new NotFoundException("Inclusion not found");
    const inUse = await this.db.$count(packageInclusions, eq(packageInclusions.inclusionId, id));
    if (inUse > 0) {
      throw new ConflictException(`Inclusion is in use by ${inUse} package(s); deactivate it instead of deleting`);
    }
    await this.tenantDb.deleteFrom(inclusions, eq(inclusions.id, id));
    this.logger.info({ inclusionId: id }, "inclusion.deleted");
  }
}
