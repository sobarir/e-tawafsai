import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../auth/roles.decorator";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import {
  createAirlineSchema,
  updateAirlineSchema,
  type CreateAirlineInput,
  type UpdateAirlineInput,
  type AirlineDto,
} from "@cometkit/shared";
import { AirlinesService } from "./airlines.service";
import { toAirlineDto } from "./airlines.policy";

@Controller("airlines")
@UseGuards(JwtAuthGuard, RolesGuard)
export class AirlinesController {
  constructor(private readonly service: AirlinesService) {}

  @Get()
  async list(): Promise<AirlineDto[]> {
    return (await this.service.list()).map(toAirlineDto);
  }

  @Post()
  @Roles("admin")
  async create(
    @Body(new ZodValidationPipe(createAirlineSchema)) input: CreateAirlineInput,
  ): Promise<AirlineDto> {
    return toAirlineDto(await this.service.create(input));
  }

  @Patch(":id")
  @Roles("admin")
  async update(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateAirlineSchema)) input: UpdateAirlineInput,
  ): Promise<AirlineDto> {
    return toAirlineDto(await this.service.update(id, input));
  }

  @Delete(":id")
  @Roles("admin")
  async remove(@Param("id") id: string): Promise<{ ok: true }> {
    await this.service.remove(id);
    return { ok: true };
  }
}
