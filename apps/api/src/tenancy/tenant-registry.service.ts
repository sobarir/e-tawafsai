import { Inject, Injectable } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { tenants, type Database, type Tenant } from "@cometkit/db";
import type { TenantContext } from "@cometkit/shared";
import { DB } from "../database/database.module";

function toContext(row: Tenant): TenantContext {
  return {
    id: row.id,
    slug: row.slug,
    tenantType: row.tenantType,
    plan: row.plan,
    planStatus: row.planStatus,
    brandName: row.brandName,
  };
}

/**
 * Reads the tenant registry. The `tenants` table is NOT tenant-owned (it is
 * the registry resolution consults to establish context), so it is accessed
 * through the raw unscoped DB by design.
 */
@Injectable()
export class TenantRegistryService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async findBySlug(slug: string): Promise<TenantContext | null> {
    const row = await this.db.query.tenants.findFirst({
      where: eq(tenants.slug, slug),
    });
    return row ? toContext(row) : null;
  }

  async findById(id: string): Promise<TenantContext | null> {
    const row = await this.db.query.tenants.findFirst({
      where: eq(tenants.id, id),
    });
    return row ? toContext(row) : null;
  }
}
