import { Injectable, BadRequestException, NotFoundException, ConflictException, Inject } from "@nestjs/common";
import { eq, and, gte, sql } from "drizzle-orm";
import { ulid } from "ulid";
import { PinoLogger, InjectPinoLogger } from "nestjs-pino";
import {
  departures,
  inventoryAdjustments,
  packages,
  type DbDeparture,
  type Database,
} from "@cometkit/db";
import {
  type CreateDepartureInput,
  type UpdateDepartureInput,
  type DepartureDto,
  type PaymentMilestone,
  type InventoryAdjustmentDto,
} from "@cometkit/shared";
import { TenantScopedDb } from "../tenancy/tenant-scoped-db";
import { DB } from "../database/database.module";

@Injectable()
export class DeparturesService {
  constructor(
    private readonly tenantDb: TenantScopedDb,
    @Inject(DB) private readonly db: Database,
    @InjectPinoLogger(DeparturesService.name)
    private readonly logger: PinoLogger,
  ) {}

  private mapToDto(dep: DbDeparture): DepartureDto {
    const seatAvailable = dep.seatTotal - dep.seatBooked - dep.seatHeld;
    return {
      id: dep.id,
      tenantId: dep.tenantId,
      packageId: dep.packageId,
      departureType: dep.departureType,
      departureDate: dep.departureDate.toISOString(),
      returnDate: dep.returnDate.toISOString(),
      seatTotal: dep.seatTotal,
      seatBooked: dep.seatBooked,
      seatHeld: dep.seatHeld,
      seatAvailable,
      currency: dep.currency,
      priceQuad: dep.priceQuad,
      priceTriple: dep.priceTriple ?? null,
      priceDouble: dep.priceDouble ?? null,
      dpAmount: dep.dpAmount,
      paymentSchedule: JSON.parse(dep.paymentSchedule) as PaymentMilestone[],
      status: dep.status,
      notes: dep.notes ?? null,
      createdAt: dep.createdAt.toISOString(),
      updatedAt: dep.updatedAt.toISOString(),
    };
  }

  async create(input: CreateDepartureInput): Promise<DepartureDto> {
    if (input.departureType && input.departureType !== "fixed_date") {
      throw new BadRequestException("Only fixed_date departureType is supported in Phase 1");
    }

    const id = ulid();
    const paymentScheduleStr = JSON.stringify(input.paymentSchedule);

    const [created] = await this.db
      .insert(departures)
      .values({
        id,
        tenantId: this.tenantDb.tenantId,
        packageId: input.packageId,
        departureType: input.departureType ?? "fixed_date",
        departureDate: new Date(input.departureDate),
        returnDate: new Date(input.returnDate),
        seatTotal: input.seatTotal,
        seatBooked: 0,
        seatHeld: 0,
        currency: input.currency ?? "IDR",
        priceQuad: input.priceQuad,
        priceTriple: input.priceTriple ?? null,
        priceDouble: input.priceDouble ?? null,
        dpAmount: input.dpAmount,
        paymentSchedule: paymentScheduleStr,
        status: "open",
        notes: input.notes ?? null,
      })
      .returning();

    if (!created) {
      throw new Error("Insert returned no departure");
    }

    this.logger.info({ departureId: id }, "departure.created");
    return this.mapToDto(created);
  }

  async findOne(id: string): Promise<DepartureDto> {
    const [dep] = await this.db
      .select()
      .from(departures)
      .where(and(eq(departures.tenantId, this.tenantDb.tenantId), eq(departures.id, id)))
      .limit(1);

    if (!dep) {
      throw new NotFoundException("Departure not found");
    }

    // Read path self-healing for departed
    if (dep.departureDate < new Date() && dep.status !== "departed" && dep.status !== "cancelled") {
      dep.status = "departed";
      await this.db
        .update(departures)
        .set({ status: "departed" })
        .where(eq(departures.id, dep.id));
    }

    return this.mapToDto(dep);
  }

  async findAll(packageId?: string): Promise<DepartureDto[]> {
    const query = this.db
      .select()
      .from(departures)
      .where(
        packageId
          ? and(eq(departures.tenantId, this.tenantDb.tenantId), eq(departures.packageId, packageId))
          : eq(departures.tenantId, this.tenantDb.tenantId)
      );

    const list = await query;
    const result: DepartureDto[] = [];
    for (const dep of list) {
      // Read path self-healing inline
      if (dep.departureDate < new Date() && dep.status !== "departed" && dep.status !== "cancelled") {
        dep.status = "departed";
        await this.db
          .update(departures)
          .set({ status: "departed" })
          .where(eq(departures.id, dep.id));
      }
      result.push(this.mapToDto(dep));
    }
    return result;
  }

  async update(id: string, input: UpdateDepartureInput): Promise<DepartureDto> {
    const [existing] = await this.db
      .select()
      .from(departures)
      .where(and(eq(departures.tenantId, this.tenantDb.tenantId), eq(departures.id, id)))
      .limit(1);

    if (!existing) {
      throw new NotFoundException("Departure not found");
    }

    const payload: Partial<typeof departures.$inferInsert> = {};
    if (input.departureDate) payload.departureDate = new Date(input.departureDate);
    if (input.returnDate) payload.returnDate = new Date(input.returnDate);
    if (input.seatTotal !== undefined) payload.seatTotal = input.seatTotal;
    if (input.currency) payload.currency = input.currency;
    if (input.priceQuad !== undefined) payload.priceQuad = input.priceQuad;
    if (input.priceTriple !== undefined) payload.priceTriple = input.priceTriple;
    if (input.priceDouble !== undefined) payload.priceDouble = input.priceDouble;
    if (input.dpAmount !== undefined) payload.dpAmount = input.dpAmount;
    if (input.paymentSchedule) payload.paymentSchedule = JSON.stringify(input.paymentSchedule);
    if (input.notes !== undefined) payload.notes = input.notes;

    const [updated] = await this.db
      .update(departures)
      .set(payload)
      .where(and(eq(departures.tenantId, this.tenantDb.tenantId), eq(departures.id, id)))
      .returning();

    if (!updated) {
      throw new Error("Update returned no departure");
    }

    return this.mapToDto(updated);
  }

  async delete(id: string): Promise<void> {
    const [existing] = await this.db
      .select()
      .from(departures)
      .where(and(eq(departures.tenantId, this.tenantDb.tenantId), eq(departures.id, id)))
      .limit(1);

    if (!existing) {
      throw new NotFoundException("Departure not found");
    }

    await this.db
      .delete(departures)
      .where(and(eq(departures.tenantId, this.tenantDb.tenantId), eq(departures.id, id)));
  }

  async mutateSeats(id: string, mutations: { deltaBooked?: number; deltaHeld?: number }): Promise<DepartureDto> {
    const deltaBooked = mutations.deltaBooked ?? 0;
    const deltaHeld = mutations.deltaHeld ?? 0;

    const result = await this.db
      .update(departures)
      .set({
        seatBooked: sql`${departures.seatBooked} + ${deltaBooked}`,
        seatHeld: sql`${departures.seatHeld} + ${deltaHeld}`,
      })
      .where(
        and(
          eq(departures.id, id),
          eq(departures.tenantId, this.tenantDb.tenantId),
          gte(
            sql`${departures.seatTotal} - ${departures.seatBooked} - ${departures.seatHeld}`,
            deltaBooked + deltaHeld
          )
        )
      )
      .returning();

    const updated = result[0];
    if (!updated) {
      throw new ConflictException("seat no longer available");
    }

    // Compute status automatically
    const seatAvailable = updated.seatTotal - updated.seatBooked - updated.seatHeld;
    let nextStatus = updated.status;
    if (updated.status !== "departed" && updated.status !== "cancelled") {
      if (seatAvailable === 0) {
        nextStatus = "full";
      } else if (seatAvailable <= 5) {
        nextStatus = "almost_full";
      } else {
        nextStatus = "open";
      }
    }

    if (nextStatus !== updated.status) {
      const [final] = await this.db
        .update(departures)
        .set({ status: nextStatus })
        .where(eq(departures.id, id))
        .returning();
      if (!final) {
        throw new Error("Update status failed");
      }
      return this.mapToDto(final);
    }

    return this.mapToDto(updated);
  }

  async adjustInventory(id: string, input: { delta: number; reason: string }, actorId: string): Promise<DepartureDto> {
    if (!input.reason || !input.reason.trim()) {
      throw new BadRequestException("Reason is required for manual inventory adjustment");
    }

    return await this.db.transaction(async (tx) => {
      const [dep] = await tx
        .select()
        .from(departures)
        .where(and(eq(departures.tenantId, this.tenantDb.tenantId), eq(departures.id, id)))
        .limit(1);

      if (!dep) {
        throw new NotFoundException("Departure not found");
      }

      const nextSeatTotal = dep.seatTotal + input.delta;
      const seatAvailable = nextSeatTotal - dep.seatBooked - dep.seatHeld;

      if (seatAvailable < 0) {
        throw new ConflictException("Adjustment would cause seat capacity to drop below 0");
      }

      // Update seatTotal
      const [updated] = await tx
        .update(departures)
        .set({ seatTotal: nextSeatTotal })
        .where(eq(departures.id, id))
        .returning();

      if (!updated) {
        throw new Error("Update returned no departure");
      }

      // Write audit log
      await tx.insert(inventoryAdjustments).values({
        id: ulid(),
        tenantId: this.tenantDb.tenantId,
        departureId: id,
        delta: input.delta,
        reason: input.reason.trim(),
        actorId,
      });

      // Update status if needed
      let nextStatus = updated.status;
      if (updated.status !== "departed" && updated.status !== "cancelled") {
        if (seatAvailable === 0) {
          nextStatus = "full";
        } else if (seatAvailable <= 5) {
          nextStatus = "almost_full";
        } else {
          nextStatus = "open";
        }
      }

      if (nextStatus !== updated.status) {
        const [final] = await tx
          .update(departures)
          .set({ status: nextStatus })
          .where(eq(departures.id, id))
          .returning();
        if (!final) {
          throw new Error("Update status failed");
        }
        return this.mapToDto(final);
      }

      return this.mapToDto(updated);
    });
  }

  async getAdjustments(departureId: string): Promise<InventoryAdjustmentDto[]> {
    const list = await this.db
      .select()
      .from(inventoryAdjustments)
      .where(
        and(
          eq(inventoryAdjustments.tenantId, this.tenantDb.tenantId),
          eq(inventoryAdjustments.departureId, departureId)
        )
      );

    return list.map((adj) => ({
      id: adj.id,
      tenantId: adj.tenantId,
      departureId: adj.departureId,
      delta: adj.delta,
      reason: adj.reason,
      actorId: adj.actorId,
      createdAt: adj.createdAt.toISOString(),
    }));
  }

  async getDashboardWidgets(): Promise<unknown> {
    const allDepartures = await this.db
      .select({
        departure: departures,
        packageName: packages.title,
      })
      .from(departures)
      .innerJoin(packages, eq(departures.packageId, packages.id))
      .where(eq(departures.tenantId, this.tenantDb.tenantId));

    const now = new Date();
    const fortyFiveDaysLater = new Date(now.getTime() + 45 * 24 * 60 * 60 * 1000);

    interface WidgetItem {
      departureId: string;
      packageName: string;
      departureDate: string;
      seatsAvailable: number;
      daysToDeparture: number;
    }

    const pushNeeded: WidgetItem[] = [];
    const almostFull: WidgetItem[] = [];

    for (const row of allDepartures) {
      const dep = row.departure;
      const seatAvailable = dep.seatTotal - dep.seatBooked - dep.seatHeld;
      const daysToDeparture = Math.ceil((dep.departureDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));

      if (dep.status === "cancelled" || dep.status === "departed") {
        continue;
      }

      const item = {
        departureId: dep.id,
        packageName: row.packageName,
        departureDate: dep.departureDate.toISOString(),
        seatsAvailable: seatAvailable,
        daysToDeparture,
      };

      // pushNeeded: within 45 days that still have seats
      if (dep.departureDate >= now && dep.departureDate <= fortyFiveDaysLater && seatAvailable > 0) {
        pushNeeded.push(item);
      }

      // almostFull: departures in almost_full status
      if (dep.status === "almost_full" && seatAvailable > 0) {
        almostFull.push(item);
      }
    }

    return { pushNeeded, almostFull };
  }
}
