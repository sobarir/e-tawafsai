import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Delete,
  UseGuards,
  Query,
} from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../auth/roles.decorator";
import { CurrentUser } from "../auth/current-user.decorator";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import {
  createDepartureSchema,
  updateDepartureSchema,
  adjustInventorySchema,
  type CreateDepartureInput,
  type UpdateDepartureInput,
  type AuthUser,
  type DepartureDto,
} from "@cometkit/shared";
import { DeparturesService } from "./departures.service";
import * as z from "zod";

@Controller("departures")
@UseGuards(JwtAuthGuard, RolesGuard)
export class DeparturesController {
  constructor(private readonly departuresService: DeparturesService) {}

  @Post()
  @Roles("admin")
  async create(
    @Body(new ZodValidationPipe(createDepartureSchema)) input: CreateDepartureInput,
  ): Promise<DepartureDto> {
    return this.departuresService.create(input);
  }

  @Get()
  async list(@Query("packageId") packageId?: string): Promise<DepartureDto[]> {
    return this.departuresService.findAll(packageId);
  }

  @Get(":id")
  async findOne(@Param("id") id: string): Promise<DepartureDto> {
    return this.departuresService.findOne(id);
  }

  @Patch(":id")
  @Roles("admin")
  async update(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateDepartureSchema)) input: UpdateDepartureInput,
  ): Promise<DepartureDto> {
    return this.departuresService.update(id, input);
  }

  @Delete(":id")
  @Roles("admin")
  async delete(@Param("id") id: string): Promise<{ success: boolean }> {
    await this.departuresService.delete(id);
    return { success: true };
  }

  @Post(":id/adjust")
  @Roles("admin")
  async adjust(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(adjustInventorySchema)) input: { delta: number; reason: string },
    @CurrentUser() user: AuthUser,
  ): Promise<DepartureDto> {
    return this.departuresService.adjustInventory(id, input, user.id);
  }

  @Post(":id/hold")
  async hold(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(z.object({ seats: z.number().int().positive() }))) input: { seats: number },
  ): Promise<DepartureDto> {
    return this.departuresService.mutateSeats(id, { deltaHeld: input.seats });
  }

  @Post(":id/release")
  async release(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(z.object({ seats: z.number().int().positive() }))) input: { seats: number },
  ): Promise<DepartureDto> {
    return this.departuresService.mutateSeats(id, { deltaHeld: -input.seats });
  }
}
