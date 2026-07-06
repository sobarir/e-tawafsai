import { Inject, Injectable, ConflictException, NotFoundException } from "@nestjs/common";
import { InjectPinoLogger, PinoLogger } from "nestjs-pino";
import { and, eq, ne, sql, type SQL } from "drizzle-orm";
import { ulid } from "ulid";
import {
  packageCategories,
  packages,
  providers,
  type DbPackageCategory,
  type Database,
} from "@cometkit/db";
import type { CreateCategoryInput, UpdateCategoryInput } from "@cometkit/shared";
import { TenantScopedDb } from "../tenancy/tenant-scoped-db";
import { DB } from "../database/database.module";
import { normalizeCategoryName } from "./categories.policy";

@Injectable()
export class CategoriesService {
  constructor(
    private readonly tenantDb: TenantScopedDb,
    @Inject(DB) private readonly db: Database,
    @InjectPinoLogger(CategoriesService.name)
    private readonly logger: PinoLogger,
  ) {}

  async list(providerId: string, productType?: string): Promise<DbPackageCategory[]> {
    const extra = productType
      ? (and(
          eq(packageCategories.providerId, providerId),
          eq(packageCategories.productType, productType as never),
        ) as SQL)
      : eq(packageCategories.providerId, providerId);
    return (await this.tenantDb.select(packageCategories, extra)) as DbPackageCategory[];
  }

  async findById(id: string): Promise<DbPackageCategory | undefined> {
    const [row] = await this.tenantDb.select(packageCategories, eq(packageCategories.id, id));
    return row as DbPackageCategory | undefined;
  }

  /**
   * Throws ConflictException if the normalized name collides with an existing
   * category in the same (provider, productType) scope. `excludeId` skips the
   * row being updated.
   */
  private async assertNoNameConflict(
    providerId: string,
    productType: string,
    name: string,
    excludeId?: string,
  ): Promise<void> {
    const match = and(
      eq(packageCategories.providerId, providerId),
      eq(packageCategories.productType, productType as never),
      eq(sql`lower(btrim(${packageCategories.name}))`, normalizeCategoryName(name)),
    ) as SQL;
    const where = excludeId ? (and(ne(packageCategories.id, excludeId), match) as SQL) : match;
    const [existing] = await this.tenantDb.select(packageCategories, where);
    if (existing) {
      throw new ConflictException(
        `A category named "${name}" already exists for this provider and product type`,
      );
    }
  }

  async create(input: CreateCategoryInput): Promise<DbPackageCategory> {
    const productType = input.productType ?? "umrah";
    // Seed commission from the provider default when omitted.
    const [provider] = await this.tenantDb.select(providers, eq(providers.id, input.providerId));
    if (!provider) throw new NotFoundException("Provider not found");
    await this.assertNoNameConflict(input.providerId, productType, input.name);

    const [row] = await this.tenantDb.insertValues(packageCategories, {
      id: ulid(),
      providerId: input.providerId,
      productType,
      name: input.name,
      commissionType:
        input.commissionType ?? (provider as { defaultCommissionType: string }).defaultCommissionType,
      commissionValue:
        input.commissionValue ?? (provider as { defaultCommissionValue: number }).defaultCommissionValue,
    });
    if (!row) throw new Error("Insert returned no row");
    this.logger.info(
      { categoryId: (row as DbPackageCategory).id, providerId: input.providerId },
      "category.created",
    );
    return row as DbPackageCategory;
  }

  async update(id: string, input: UpdateCategoryInput): Promise<DbPackageCategory> {
    const existing = await this.findById(id);
    if (!existing) throw new NotFoundException("Category not found");
    if (input.name && normalizeCategoryName(input.name) !== normalizeCategoryName(existing.name)) {
      await this.assertNoNameConflict(existing.providerId, existing.productType, input.name, id);
    }
    const [row] = await this.tenantDb.update(packageCategories, { ...input }, eq(packageCategories.id, id));
    if (!row) throw new NotFoundException("Category not found");
    this.logger.info({ categoryId: id }, "category.updated");
    return row as DbPackageCategory;
  }

  async remove(id: string): Promise<void> {
    const existing = await this.findById(id);
    if (!existing) throw new NotFoundException("Category not found");
    const inUse = await this.db.$count(packages, eq(packages.categoryId, id));
    if (inUse > 0) {
      throw new ConflictException(`Category is in use by ${inUse} package(s) and cannot be deleted`);
    }
    await this.tenantDb.deleteFrom(packageCategories, eq(packageCategories.id, id));
    this.logger.info({ categoryId: id }, "category.deleted");
  }
}
