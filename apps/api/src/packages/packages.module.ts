import { Module, Injectable, Inject, forwardRef } from "@nestjs/common";
import { StorageModule } from "../storage/storage.module";
import { PackagesController } from "./packages.controller";
import { PackagesService } from "./packages.service";
import { type ProviderCascadeService } from "../providers/providers.service";
import { TenantScopedDb } from "../tenancy/tenant-scoped-db";
import { packages, type Database } from "@cometkit/db";
import { eq, and } from "drizzle-orm";
import { DB } from "../database/database.module";

@Injectable()
export class PackagesCascadeService implements ProviderCascadeService {
  constructor(
    private readonly tenantDb: TenantScopedDb,
    @Inject(DB) private readonly db: Database,
    @Inject(forwardRef(() => PackagesService))
    private readonly packagesService: PackagesService,
  ) {}

  async getAffectedPackages(providerId: string): Promise<{ id: string; name: string }[]> {
    const list = await this.db
      .select({ id: packages.id, name: packages.title })
      .from(packages)
      .where(and(eq(packages.providerId, providerId), eq(packages.status, "published")));
    return list;
  }

  async unpublishPackages(providerId: string): Promise<void> {
    await this.packagesService.cascadeUnpublishForProvider(providerId);
  }
}

@Module({
  imports: [StorageModule],
  controllers: [PackagesController],
  providers: [
    PackagesService,
    PackagesCascadeService,
  ],
  exports: [PackagesService, PackagesCascadeService],
})
export class PackagesModule {}
