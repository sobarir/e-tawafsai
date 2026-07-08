import { Inject, Injectable, ConflictException, NotFoundException } from "@nestjs/common";
import { InjectPinoLogger, PinoLogger } from "nestjs-pino";
import { and, eq, ne, sql, type SQL } from "drizzle-orm";
import { ulid } from "ulid";
import { exclusions, packageExclusions, type DbExclusion, type Database } from "@cometkit/db";
import type { CreateExclusionInput, UpdateExclusionInput } from "@cometkit/shared";
import { TenantScopedDb } from "../tenancy/tenant-scoped-db";
import { DB } from "../database/database.module";
import { normalizeExclusionName } from "./exclusions.policy";

@Injectable()
export class ExclusionsService {
  constructor(
    private readonly tenantDb: TenantScopedDb,
    @Inject(DB) private readonly db: Database,
    @InjectPinoLogger(ExclusionsService.name) private readonly logger: PinoLogger,
  ) {}

  async list(): Promise<DbExclusion[]> {
    return (await this.tenantDb.select(exclusions)) as DbExclusion[];
  }

  async findById(id: string): Promise<DbExclusion | undefined> {
    const [row] = await this.tenantDb.select(exclusions, eq(exclusions.id, id));
    return row as DbExclusion | undefined;
  }

  private async assertNoNameConflict(name: string, excludeId?: string): Promise<void> {
    const match = eq(sql`lower(btrim(${exclusions.name}))`, normalizeExclusionName(name)) as SQL;
    const where = excludeId ? (and(ne(exclusions.id, excludeId), match) as SQL) : match;
    const [existing] = await this.tenantDb.select(exclusions, where);
    if (existing) throw new ConflictException(`An exclusion named "${name}" already exists`);
  }

  private isUniqueViolation(err: unknown): boolean {
    const code = (e: unknown): string | undefined =>
      typeof e === "object" && e !== null ? (e as { code?: string }).code : undefined;
    if (code(err) === "23505") return true;
    const cause = typeof err === "object" && err !== null ? (err as { cause?: unknown }).cause : undefined;
    return code(cause) === "23505";
  }

  async create(input: CreateExclusionInput): Promise<DbExclusion> {
    await this.assertNoNameConflict(input.name);
    try {
      const [row] = await this.tenantDb.insertValues(exclusions, {
        id: ulid(),
        name: input.name,
        isActive: input.isActive ?? true,
      });
      if (!row) throw new Error("Insert returned no row");
      this.logger.info({ exclusionId: (row as DbExclusion).id }, "exclusion.created");
      return row as DbExclusion;
    } catch (err) {
      if (this.isUniqueViolation(err)) throw new ConflictException(`An exclusion named "${input.name}" already exists`);
      throw err;
    }
  }

  async update(id: string, input: UpdateExclusionInput): Promise<DbExclusion> {
    const existing = await this.findById(id);
    if (!existing) throw new NotFoundException("Exclusion not found");
    if (input.name && normalizeExclusionName(input.name) !== normalizeExclusionName(existing.name)) {
      await this.assertNoNameConflict(input.name, id);
    }
    try {
      const [row] = await this.tenantDb.update(exclusions, { ...input }, eq(exclusions.id, id));
      if (!row) throw new NotFoundException("Exclusion not found");
      this.logger.info({ exclusionId: id }, "exclusion.updated");
      return row as DbExclusion;
    } catch (err) {
      if (this.isUniqueViolation(err)) throw new ConflictException(`An exclusion named "${input.name}" already exists`);
      throw err;
    }
  }

  async remove(id: string): Promise<void> {
    const existing = await this.findById(id);
    if (!existing) throw new NotFoundException("Exclusion not found");
    const inUse = await this.db.$count(packageExclusions, eq(packageExclusions.exclusionId, id));
    if (inUse > 0) {
      throw new ConflictException(`Exclusion is in use by ${inUse} package(s); deactivate it instead of deleting`);
    }
    await this.tenantDb.deleteFrom(exclusions, eq(exclusions.id, id));
    this.logger.info({ exclusionId: id }, "exclusion.deleted");
  }
}
