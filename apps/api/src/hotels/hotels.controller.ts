import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../auth/roles.decorator";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import {
  createHotelSchema,
  updateHotelSchema,
  type CreateHotelInput,
  type UpdateHotelInput,
  type HotelDto,
} from "@cometkit/shared";
import { HotelsService } from "./hotels.service";
import { toHotelDto } from "./hotels.policy";

@Controller("hotels")
@UseGuards(JwtAuthGuard, RolesGuard)
export class HotelsController {
  constructor(private readonly service: HotelsService) {}

  @Get()
  async list(): Promise<HotelDto[]> {
    return (await this.service.list()).map(toHotelDto);
  }

  @Post()
  @Roles("admin")
  async create(
    @Body(new ZodValidationPipe(createHotelSchema)) input: CreateHotelInput,
  ): Promise<HotelDto> {
    return toHotelDto(await this.service.create(input));
  }

  @Patch(":id")
  @Roles("admin")
  async update(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateHotelSchema)) input: UpdateHotelInput,
  ): Promise<HotelDto> {
    return toHotelDto(await this.service.update(id, input));
  }

  @Delete(":id")
  @Roles("admin")
  async remove(@Param("id") id: string): Promise<{ ok: true }> {
    await this.service.remove(id);
    return { ok: true };
  }
}
