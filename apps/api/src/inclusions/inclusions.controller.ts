import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../auth/roles.decorator";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import {
  createInclusionSchema,
  updateInclusionSchema,
  type CreateInclusionInput,
  type UpdateInclusionInput,
  type InclusionDto,
} from "@cometkit/shared";
import { InclusionsService } from "./inclusions.service";
import { toInclusionDto } from "./inclusions.policy";

@Controller("inclusions")
@UseGuards(JwtAuthGuard, RolesGuard)
export class InclusionsController {
  constructor(private readonly service: InclusionsService) {}

  @Get()
  async list(): Promise<InclusionDto[]> {
    return (await this.service.list()).map(toInclusionDto);
  }

  @Post()
  @Roles("admin")
  async create(
    @Body(new ZodValidationPipe(createInclusionSchema)) input: CreateInclusionInput,
  ): Promise<InclusionDto> {
    return toInclusionDto(await this.service.create(input));
  }

  @Patch(":id")
  @Roles("admin")
  async update(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateInclusionSchema)) input: UpdateInclusionInput,
  ): Promise<InclusionDto> {
    return toInclusionDto(await this.service.update(id, input));
  }

  @Delete(":id")
  @Roles("admin")
  async remove(@Param("id") id: string): Promise<{ ok: true }> {
    await this.service.remove(id);
    return { ok: true };
  }
}
