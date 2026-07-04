import { Inject, Injectable } from "@nestjs/common";
import { ClsService } from "nestjs-cls";
import { and, eq, type SQL } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";
import type { Database } from "@cometkit/db";
import { DB } from "../database/database.module";
import { TENANT_ID_KEY, TenantContextMissingError } from "./tenant-context";

/** A table is tenant-owned when it carries a `tenantId` column. */
type TenantOwnedTable = PgTable & { tenantId: PgColumn };

/**
 * The ONLY data accessor for tenant-owned tables. Reads are filtered to the
 * active tenant; writes are stamped with it; every operation throws when no
 * tenant context exists. Raw `DB` is reserved for migrations/seed and
 * tenant-registry reads (the tenants table is not tenant-owned).
 */
@Injectable()
export class TenantScopedDb {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly cls: ClsService,
  ) {}

  /** Active tenant id; throws if the request established no tenant context. */
  get tenantId(): string {
    const id = this.cls.get<string | undefined>(TENANT_ID_KEY);
    if (!id) throw new TenantContextMissingError();
    return id;
  }

  private scope(table: TenantOwnedTable, extra?: SQL): SQL {
    const tenantPredicate = eq(table.tenantId, this.tenantId);
    return extra ? (and(tenantPredicate, extra) as SQL) : tenantPredicate;
  }

  select<T extends TenantOwnedTable>(table: T, extraWhere?: SQL) {
    return this.db.select().from(table as PgTable).where(this.scope(table, extraWhere));
  }

  count(table: TenantOwnedTable, extraWhere?: SQL): Promise<number> {
    return this.db.$count(table as PgTable, this.scope(table, extraWhere));
  }

  /** Insert into a tenant-owned table, stamping the active tenant id. */
  insertValues<T extends TenantOwnedTable>(
    table: T,
    values: Record<string, unknown>,
  ) {
    return this.db
      .insert(table as PgTable)
      .values({ ...values, tenantId: this.tenantId } as never)
      .returning();
  }

  update<T extends TenantOwnedTable>(
    table: T,
    set: Record<string, unknown>,
    extraWhere?: SQL,
  ) {
    return this.db
      .update(table as PgTable)
      .set(set as never)
      .where(this.scope(table, extraWhere))
      .returning();
  }

  deleteFrom<T extends TenantOwnedTable>(table: T, extraWhere?: SQL) {
    return this.db
      .delete(table as PgTable)
      .where(this.scope(table, extraWhere))
      .returning();
  }
}
