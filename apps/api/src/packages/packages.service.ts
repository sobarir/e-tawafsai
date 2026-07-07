import { Injectable, BadRequestException, NotFoundException, Inject } from "@nestjs/common";
import { eq, and } from "drizzle-orm";
import { ulid } from "ulid";
import { PinoLogger, InjectPinoLogger } from "nestjs-pino";
import {
  packages,
  packageHotels,
  packageCategories,
  airlines,
  departureCities,
  tags,
  packageTags,
  packageFlyers,
  providers,
  departures,
  type DbPackage,
  type DbPackageHotel,
  type DbPackageCategory,
  type Database,
} from "@cometkit/db";
import {
  type CreatePackageInput,
  type UpdatePackageInput,
  type PackageDto,
  type HotelInput,
} from "@cometkit/shared";
import { TenantScopedDb } from "../tenancy/tenant-scoped-db";
import { PackagesPolicy } from "./packages.policy";
import { categoryMatchesScope } from "../categories/categories.policy";
import { DB } from "../database/database.module";

function slugify(text: string): string {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^\w-]+/g, "")
    .replace(/--+/g, "-");
}

@Injectable()
export class PackagesService {
  constructor(
    private readonly tenantDb: TenantScopedDb,
    @Inject(DB) private readonly db: Database,
    @InjectPinoLogger(PackagesService.name)
    private readonly logger: PinoLogger,
  ) {}

  async create(input: CreatePackageInput): Promise<DbPackage> {
    if (input.productType && input.productType !== "umrah") {
      throw new BadRequestException("Only umrah productType is supported in Phase 1");
    }

    const id = ulid();
    const slug = await this.generateUniqueSlug(input.title);
    const productType = input.productType ?? "umrah";
    const categoryId = input.categoryId ?? null;

    if (categoryId) {
      await this.assertCategoryScope(categoryId, input.providerId, productType);
    }
    if (input.airlineId) await this.assertAirlineOwned(input.airlineId);
    if (input.departureCityId) await this.assertDepartureCityOwned(input.departureCityId);

    const [created] = await this.db
      .insert(packages)
      .values({
        id,
        tenantId: this.tenantDb.tenantId,
        providerId: input.providerId,
        productType,
        title: input.title,
        slug,
        categoryId,
        plusDestination: input.plusDestination ?? null,
        durationDays: input.durationDays ?? null,
        description: input.description ?? null,
        airlineId: input.airlineId ?? null,
        flightRoute: input.flightRoute ?? null,
        departureCityId: input.departureCityId ?? null,
        isFeatured: input.isFeatured ?? false,
        status: "draft",
        hasBeenPublished: false,
      })
      .returning();

    if (!created) {
      throw new Error("Insert returned no package");
    }

    this.logger.info({ packageId: id }, "package.created");
    return created;
  }

  async findOne(id: string): Promise<PackageDto> {
    const [pkg] = await this.db
      .select()
      .from(packages)
      .where(and(eq(packages.tenantId, this.tenantDb.tenantId), eq(packages.id, id)))
      .limit(1);

    if (!pkg) {
      throw new NotFoundException("Package not found");
    }

    const hotels = await this.db
      .select()
      .from(packageHotels)
      .where(eq(packageHotels.packageId, id));

    const flyerRecords = await this.db
      .select()
      .from(packageFlyers)
      .where(eq(packageFlyers.packageId, id));

    const tagRecords = await this.db
      .select({ name: tags.name })
      .from(packageTags)
      .innerJoin(tags, eq(packageTags.tagId, tags.id))
      .where(eq(packageTags.packageId, id));

    const deps = await this.db
      .select()
      .from(departures)
      .where(and(eq(departures.tenantId, this.tenantDb.tenantId), eq(departures.packageId, id)));

    // A published Package whose Departures are all full, departed, or cancelled
    // is flagged for review.
    const hasDepartures = deps.length > 0;
    const allClosed = hasDepartures && deps.every((d) => ["full", "departed", "cancelled"].includes(d.status));
    const needsReview = pkg.status === "published" && allClosed;

    let categoryName: string | null = null;
    if (pkg.categoryId) {
      const [categoryRow] = await this.db
        .select({ name: packageCategories.name })
        .from(packageCategories)
        .where(
          and(
            eq(packageCategories.tenantId, this.tenantDb.tenantId),
            eq(packageCategories.id, pkg.categoryId),
          ),
        )
        .limit(1);
      categoryName = categoryRow?.name ?? null;
    }

    let airlineName: string | null = null;
    if (pkg.airlineId) {
      const [a] = await this.db
        .select({ name: airlines.name })
        .from(airlines)
        .where(and(eq(airlines.tenantId, this.tenantDb.tenantId), eq(airlines.id, pkg.airlineId)))
        .limit(1);
      airlineName = a?.name ?? null;
    }

    let departureCityName: string | null = null;
    if (pkg.departureCityId) {
      const [c] = await this.db
        .select({ name: departureCities.name })
        .from(departureCities)
        .where(and(eq(departureCities.tenantId, this.tenantDb.tenantId), eq(departureCities.id, pkg.departureCityId)))
        .limit(1);
      departureCityName = c?.name ?? null;
    }

    return {
      ...pkg,
      categoryId: pkg.categoryId,
      categoryName,
      airlineName,
      departureCityName,
      needsReview,
      hotels: hotels.map((h) => ({
        cityName: h.cityName,
        name: h.name,
        stars: h.stars,
        distanceM: h.distanceM,
        isPelataran: h.isPelataran,
      })),
      flyers: flyerRecords.map((f) => f.url),
      tags: tagRecords.map((t) => t.name),
      createdAt: pkg.createdAt.toISOString(),
      updatedAt: pkg.updatedAt.toISOString(),
    };
  }

  async findAll(): Promise<PackageDto[]> {
    const list = await this.db
      .select()
      .from(packages)
      .where(eq(packages.tenantId, this.tenantDb.tenantId));

    const result: PackageDto[] = [];
    for (const pkg of list) {
      const detail = await this.findOne(pkg.id);
      result.push(detail);
    }
    return result;
  }

  async update(id: string, input: UpdatePackageInput): Promise<DbPackage> {
    const [existing] = await this.db
      .select()
      .from(packages)
      .where(and(eq(packages.tenantId, this.tenantDb.tenantId), eq(packages.id, id)))
      .limit(1);

    if (!existing) {
      throw new NotFoundException("Package not found");
    }

    const effectiveCategoryId =
      input.categoryId !== undefined ? input.categoryId : existing.categoryId;
    const effectiveProviderId = input.providerId ?? existing.providerId;
    const effectiveProductType = input.productType ?? existing.productType;

    if (effectiveCategoryId) {
      await this.assertCategoryScope(
        effectiveCategoryId,
        effectiveProviderId,
        effectiveProductType,
      );
    }
    if (input.airlineId) await this.assertAirlineOwned(input.airlineId);
    if (input.departureCityId) await this.assertDepartureCityOwned(input.departureCityId);

    const updateData: Partial<DbPackage> = {
      ...input,
      updatedAt: new Date(),
    };

    // Slug immutability check
    if (input.title && input.title !== existing.title) {
      if (existing.hasBeenPublished) {
        // Keep existing slug
        this.logger.warn({ packageId: id }, "package.slug_update_blocked_immutable");
      } else {
        updateData.slug = await this.generateUniqueSlug(input.title);
      }
    }

    const [updated] = await this.db
      .update(packages)
      .set(updateData)
      .where(eq(packages.id, id))
      .returning();

    if (!updated) {
      throw new Error("Update returned no package");
    }

    this.logger.info({ packageId: id }, "package.updated");
    return updated;
  }

  async addHotel(packageId: string, hotel: HotelInput): Promise<DbPackageHotel> {
    const id = ulid();
    const [created] = await this.db
      .insert(packageHotels)
      .values({
        id,
        packageId,
        cityName: hotel.cityName,
        name: hotel.name,
        stars: hotel.stars,
        distanceM: hotel.distanceM ?? null,
        isPelataran: hotel.isPelataran,
      })
      .returning();

    if (!created) {
      throw new Error("Insert returned no hotel");
    }

    return created;
  }

  async publish(id: string): Promise<DbPackage> {
    const pkg = await this.findOne(id);
    const [provider] = await this.db
      .select()
      .from(providers)
      .where(and(eq(providers.tenantId, this.tenantDb.tenantId), eq(providers.id, pkg.providerId)))
      .limit(1);

    if (!provider) {
      throw new BadRequestException("Provider not found");
    }

    const errors = PackagesPolicy.validatePublishReady(
      pkg,
      provider.isActive,
      provider.ppiuLicenseNo,
    );

    if (errors.length > 0) {
      throw new BadRequestException(
        `Publish blocked on missing fields: ${errors.join(", ")}`,
      );
    }

    const [updated] = await this.db
      .update(packages)
      .set({
        status: "published",
        hasBeenPublished: true,
        updatedAt: new Date(),
      })
      .where(eq(packages.id, id))
      .returning();

    if (!updated) {
      throw new Error("Publish returned no package");
    }

    this.logger.info({ packageId: id }, "package.published");
    return updated;
  }

  async unpublish(id: string): Promise<DbPackage> {
    const [updated] = await this.db
      .update(packages)
      .set({
        status: "draft",
        updatedAt: new Date(),
      })
      .where(eq(packages.id, id))
      .returning();

    if (!updated) {
      throw new Error("Unpublish returned no package");
    }

    this.logger.info({ packageId: id }, "package.unpublished");
    return updated;
  }

  async addFlyer(packageId: string, url: string): Promise<void> {
    await this.db.insert(packageFlyers).values({
      id: ulid(),
      packageId,
      url,
    });
  }

  async cascadeUnpublishForProvider(providerId: string): Promise<void> {
    await this.db
      .update(packages)
      .set({ status: "draft", updatedAt: new Date() })
      .where(and(eq(packages.providerId, providerId), eq(packages.status, "published")));

    this.logger.info({ providerId }, "packages.cascade_unpublished");
  }

  /**
   * Loads the category (tenant-scoped) and throws BadRequestException("category")
   * when it does not exist or does not belong to the package's provider + productType.
   */
  private async assertCategoryScope(
    categoryId: string,
    providerId: string,
    productType: string,
  ): Promise<void> {
    const [category] = (await this.tenantDb.select(
      packageCategories,
      eq(packageCategories.id, categoryId),
    )) as DbPackageCategory[];

    if (!category || !categoryMatchesScope(category, providerId, productType)) {
      throw new BadRequestException("category");
    }
  }

  private async assertAirlineOwned(airlineId: string): Promise<void> {
    const [row] = await this.tenantDb.select(airlines, eq(airlines.id, airlineId));
    if (!row) throw new BadRequestException("airline");
  }

  private async assertDepartureCityOwned(departureCityId: string): Promise<void> {
    const [row] = await this.tenantDb.select(departureCities, eq(departureCities.id, departureCityId));
    if (!row) throw new BadRequestException("departureCity");
  }

  private async generateUniqueSlug(title: string): Promise<string> {
    const baseSlug = slugify(title);
    let slug = baseSlug;
    let attempts = 0;

    while (attempts < 10) {
      const [existing] = await this.db
        .select({ id: packages.id })
        .from(packages)
        .where(and(eq(packages.tenantId, this.tenantDb.tenantId), eq(packages.slug, slug)))
        .limit(1);

      if (!existing) {
        return slug;
      }

      const randomSuffix = Math.random().toString(36).substring(2, 5);
      slug = `${baseSlug}-${randomSuffix}`;
      attempts++;
    }

    return `${baseSlug}-${ulid().substring(0, 8).toLowerCase()}`;
  }
}
