import {
  Inject,
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from "@nestjs/common";
import { InjectPinoLogger, PinoLogger } from "nestjs-pino";
import { and, desc, eq, ne, or, isNotNull, sql, type SQL } from "drizzle-orm";
import { providers, type Provider } from "@cometkit/db";
import {
  normalizeProviderName,
  normalizePpiu,
  type CreateProviderInput,
  type UpdateProviderInput,
  type ListProvidersQuery,
  type Paginated,
} from "@cometkit/shared";
import { ulid } from "ulid";
import { TenantScopedDb } from "../tenancy/tenant-scoped-db";

export const PROVIDER_CASCADE_SERVICE_TOKEN = Symbol("ProviderCascadeService");

export interface ProviderCascadeService {
  getAffectedPackages(providerId: string): Promise<{ id: string; name: string }[]>;
  unpublishPackages(providerId: string): Promise<void>;
}

@Injectable()
export class ProvidersService {
  constructor(
    private readonly db: TenantScopedDb,
    @InjectPinoLogger(ProvidersService.name)
    private readonly logger: PinoLogger,
    @Inject(PROVIDER_CASCADE_SERVICE_TOKEN)
    private readonly cascadeService: ProviderCascadeService,
  ) {}

  async findById(id: string): Promise<Provider | undefined> {
    const [row] = await this.db.select(providers, eq(providers.id, id));
    return row as Provider | undefined;
  }

  /**
   * Throws ConflictException if the normalized name or PPIU collides with an
   * existing provider in the tenant. `excludeId` skips the row being updated.
   */
  private async assertNoConflict(
    name: string | undefined,
    ppiu: string | null,
    excludeId?: string,
  ): Promise<void> {
    const clauses: SQL[] = [];
    if (name !== undefined) {
      clauses.push(eq(sql`lower(trim(${providers.name}))`, normalizeProviderName(name)));
    }
    if (ppiu !== null) {
      clauses.push(
        and(isNotNull(providers.ppiuLicenseNo), eq(sql`trim(${providers.ppiuLicenseNo})`, ppiu)) as SQL,
      );
    }
    if (clauses.length === 0) return;

    const match = or(...clauses) as SQL;
    const where = excludeId ? (and(ne(providers.id, excludeId), match) as SQL) : match;
    const [existing] = await this.db.select(providers, where);
    if (existing) {
      throw new ConflictException(
        `A provider with the same name or PPIU license already exists (id ${(existing as { id: string }).id})`,
      );
    }
  }

  /** postgres-js unique-violation → 409, as a concurrency backstop for the pre-check. */
  private isUniqueViolation(err: unknown): boolean {
    return typeof err === "object" && err !== null && (err as { code?: string }).code === "23505";
  }

  async create(input: CreateProviderInput): Promise<Provider> {
    const id = ulid();
    const ppiu = normalizePpiu(input.ppiuLicenseNo);
    await this.assertNoConflict(input.name, ppiu);
    try {
      const [row] = await this.db.insertValues(providers, {
        id,
        name: input.name,
        brandName: input.brandName,
        ppiuLicenseNo: ppiu,
        pihkLicenseNo: input.pihkLicenseNo ?? null,
        accreditation: input.accreditation ?? "unknown",
        contactPerson: input.contactPerson,
        contactPhone: input.contactPhone,
        logoUrl: input.logoUrl ?? null,
        allowLogoOnPublicPages: input.allowLogoOnPublicPages ?? false,
        defaultCommissionType: input.defaultCommissionType ?? "flat_per_pax",
        defaultCommissionValue: input.defaultCommissionValue ?? 0,
        commissionNotes: input.commissionNotes ?? null,
        isActive: false,
        pricePublicationConsentAt: null,
      });
      if (!row) throw new Error("Insert returned no row");
      this.logger.info({ providerId: id }, "provider.created");
      return row as Provider;
    } catch (err) {
      if (this.isUniqueViolation(err)) {
        throw new ConflictException("A provider with the same name or PPIU license already exists");
      }
      throw err;
    }
  }

  async list(query: ListProvidersQuery): Promise<Paginated<Provider>> {
    const { page, limit } = query;
    const [rows, total] = await Promise.all([
      this.db
        .select(providers)
        .orderBy(desc(providers.id))
        .limit(limit)
        .offset((page - 1) * limit),
      this.db.count(providers),
    ]);
    return {
      data: rows as Provider[],
      meta: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  async update(id: string, input: UpdateProviderInput): Promise<Provider> {
    const ppiu = "ppiuLicenseNo" in input ? normalizePpiu(input.ppiuLicenseNo) : null;
    await this.assertNoConflict(input.name, ppiu, id);
    const set: Record<string, unknown> = { ...input };
    if ("ppiuLicenseNo" in input) set.ppiuLicenseNo = ppiu;
    try {
      const [row] = await this.db.update(providers, set, eq(providers.id, id));
      if (!row) throw new NotFoundException("Provider not found");
      this.logger.info({ providerId: id }, "provider.updated");
      return row as Provider;
    } catch (err) {
      if (this.isUniqueViolation(err)) {
        throw new ConflictException("A provider with the same name or PPIU license already exists");
      }
      throw err;
    }
  }

  async activate(
    id: string,
    input: { ppiuLicenseNo?: string | null; pihkLicenseNo?: string | null; consentConfirmed: boolean },
  ): Promise<Provider> {
    const provider = await this.findById(id);
    if (!provider) throw new NotFoundException("Provider not found");

    const ppiu = input.ppiuLicenseNo ?? provider.ppiuLicenseNo;
    const pihk = input.pihkLicenseNo ?? provider.pihkLicenseNo;

    if (!ppiu && !pihk) {
      throw new BadRequestException("At least one license number (PPIU or PIHK) is required to activate");
    }

    if (!input.consentConfirmed) {
      throw new BadRequestException("Price publication consent must be confirmed to activate");
    }

    const [row] = await this.db.update(
      providers,
      {
        ppiuLicenseNo: ppiu || null,
        pihkLicenseNo: pihk || null,
        isActive: true,
        pricePublicationConsentAt: new Date(),
      },
      eq(providers.id, id),
    );

    if (!row) throw new Error("Activation update failed");
    this.logger.info({ providerId: id }, "provider.activated");
    return row as Provider;
  }

  async deactivate(id: string): Promise<{ provider: Provider; affectedPackages: { id: string; name: string }[] }> {
    const provider = await this.findById(id);
    if (!provider) throw new NotFoundException("Provider not found");

    // Get affected packages from the cascade service stub
    const affectedPackages = await this.cascadeService.getAffectedPackages(id);

    // Perform deactivation and package unpublish in a single NestJS service sequence
    await this.cascadeService.unpublishPackages(id);
    const [row] = await this.db.update(
      providers,
      { isActive: false },
      eq(providers.id, id),
    );

    if (!row) throw new Error("Deactivation update failed");
    this.logger.info({ providerId: id }, "provider.deactivated");
    return {
      provider: row as Provider,
      affectedPackages,
    };
  }
}
