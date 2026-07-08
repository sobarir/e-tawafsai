import { Inject, Injectable, ConflictException, NotFoundException } from "@nestjs/common";
import { InjectPinoLogger, PinoLogger } from "nestjs-pino";
import { and, eq, ne, sql, type SQL } from "drizzle-orm";
import { ulid } from "ulid";
import { hotels, packageHotels, type DbHotel, type Database } from "@cometkit/db";
import type { CreateHotelInput, UpdateHotelInput } from "@cometkit/shared";
import { TenantScopedDb } from "../tenancy/tenant-scoped-db";
import { DB } from "../database/database.module";
import { normalizeHotelName } from "./hotels.policy";

@Injectable()
export class HotelsService {
  constructor(
    private readonly tenantDb: TenantScopedDb,
    @Inject(DB) private readonly db: Database,
    @InjectPinoLogger(HotelsService.name) private readonly logger: PinoLogger,
  ) {}

  async list(): Promise<DbHotel[]> {
    return (await this.tenantDb.select(hotels)) as DbHotel[];
  }

  async findById(id: string): Promise<DbHotel | undefined> {
    const [row] = await this.tenantDb.select(hotels, eq(hotels.id, id));
    return row as DbHotel | undefined;
  }

  private async assertNoConflict(name: string, city: string, excludeId?: string): Promise<void> {
    const match = and(
      eq(sql`lower(btrim(${hotels.name}))`, normalizeHotelName(name)),
      eq(sql`lower(btrim(${hotels.city}))`, normalizeHotelName(city)),
    ) as SQL;
    const where = excludeId ? (and(ne(hotels.id, excludeId), match) as SQL) : match;
    const [existing] = await this.tenantDb.select(hotels, where);
    if (existing) throw new ConflictException(`A hotel "${name}" in ${city} already exists`);
  }

  private isUniqueViolation(err: unknown): boolean {
    const code = (e: unknown): string | undefined =>
      typeof e === "object" && e !== null ? (e as { code?: string }).code : undefined;
    if (code(err) === "23505") return true;
    const cause = typeof err === "object" && err !== null ? (err as { cause?: unknown }).cause : undefined;
    return code(cause) === "23505";
  }

  async create(input: CreateHotelInput): Promise<DbHotel> {
    await this.assertNoConflict(input.name, input.city);
    try {
      const [row] = await this.tenantDb.insertValues(hotels, {
        id: ulid(),
        name: input.name,
        city: input.city,
        stars: input.stars ?? 3,
        distanceM: input.distanceM ?? null,
        isPelataran: input.isPelataran ?? false,
        isActive: input.isActive ?? true,
      });
      if (!row) throw new Error("Insert returned no row");
      this.logger.info({ hotelId: (row as DbHotel).id }, "hotel.created");
      return row as DbHotel;
    } catch (err) {
      if (this.isUniqueViolation(err)) throw new ConflictException(`A hotel "${input.name}" in ${input.city} already exists`);
      throw err;
    }
  }

  async update(id: string, input: UpdateHotelInput): Promise<DbHotel> {
    const existing = await this.findById(id);
    if (!existing) throw new NotFoundException("Hotel not found");
    const nextName = input.name ?? existing.name;
    const nextCity = input.city ?? existing.city;
    if (
      normalizeHotelName(nextName) !== normalizeHotelName(existing.name) ||
      normalizeHotelName(nextCity) !== normalizeHotelName(existing.city)
    ) {
      await this.assertNoConflict(nextName, nextCity, id);
    }
    try {
      const [row] = await this.tenantDb.update(hotels, { ...input }, eq(hotels.id, id));
      if (!row) throw new NotFoundException("Hotel not found");
      this.logger.info({ hotelId: id }, "hotel.updated");
      return row as DbHotel;
    } catch (err) {
      if (this.isUniqueViolation(err)) throw new ConflictException(`A hotel "${nextName}" in ${nextCity} already exists`);
      throw err;
    }
  }

  async remove(id: string): Promise<void> {
    const existing = await this.findById(id);
    if (!existing) throw new NotFoundException("Hotel not found");
    const inUse = await this.db.$count(packageHotels, eq(packageHotels.hotelId, id));
    if (inUse > 0) {
      throw new ConflictException(`Hotel is in use by ${inUse} package(s); deactivate it instead of deleting`);
    }
    await this.tenantDb.deleteFrom(hotels, eq(hotels.id, id));
    this.logger.info({ hotelId: id }, "hotel.deleted");
  }
}
