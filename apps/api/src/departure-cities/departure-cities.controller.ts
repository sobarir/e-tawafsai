import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../auth/roles.decorator";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import {
  createDepartureCitySchema,
  updateDepartureCitySchema,
  type CreateDepartureCityInput,
  type UpdateDepartureCityInput,
  type DepartureCityDto,
} from "@cometkit/shared";
import { DepartureCitiesService } from "./departure-cities.service";
import { toDepartureCityDto } from "./departure-cities.policy";

@Controller("departure-cities")
@UseGuards(JwtAuthGuard, RolesGuard)
export class DepartureCitiesController {
  constructor(private readonly service: DepartureCitiesService) {}

  @Get()
  async list(): Promise<DepartureCityDto[]> {
    return (await this.service.list()).map(toDepartureCityDto);
  }

  @Post()
  @Roles("admin")
  async create(
    @Body(new ZodValidationPipe(createDepartureCitySchema)) input: CreateDepartureCityInput,
  ): Promise<DepartureCityDto> {
    return toDepartureCityDto(await this.service.create(input));
  }

  @Patch(":id")
  @Roles("admin")
  async update(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateDepartureCitySchema)) input: UpdateDepartureCityInput,
  ): Promise<DepartureCityDto> {
    return toDepartureCityDto(await this.service.update(id, input));
  }

  @Delete(":id")
  @Roles("admin")
  async remove(@Param("id") id: string): Promise<{ ok: true }> {
    await this.service.remove(id);
    return { ok: true };
  }
}
