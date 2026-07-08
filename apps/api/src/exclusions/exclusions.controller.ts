import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../auth/roles.decorator";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import {
  createExclusionSchema,
  updateExclusionSchema,
  type CreateExclusionInput,
  type UpdateExclusionInput,
  type ExclusionDto,
} from "@cometkit/shared";
import { ExclusionsService } from "./exclusions.service";
import { toExclusionDto } from "./exclusions.policy";

@Controller("exclusions")
@UseGuards(JwtAuthGuard, RolesGuard)
export class ExclusionsController {
  constructor(private readonly service: ExclusionsService) {}

  @Get()
  async list(): Promise<ExclusionDto[]> {
    return (await this.service.list()).map(toExclusionDto);
  }

  @Post()
  @Roles("admin")
  async create(
    @Body(new ZodValidationPipe(createExclusionSchema)) input: CreateExclusionInput,
  ): Promise<ExclusionDto> {
    return toExclusionDto(await this.service.create(input));
  }

  @Patch(":id")
  @Roles("admin")
  async update(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateExclusionSchema)) input: UpdateExclusionInput,
  ): Promise<ExclusionDto> {
    return toExclusionDto(await this.service.update(id, input));
  }

  @Delete(":id")
  @Roles("admin")
  async remove(@Param("id") id: string): Promise<{ ok: true }> {
    await this.service.remove(id);
    return { ok: true };
  }
}
