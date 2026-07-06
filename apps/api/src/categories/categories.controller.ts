import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../auth/roles.decorator";
import { CurrentUser } from "../auth/current-user.decorator";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import {
  createCategorySchema,
  updateCategorySchema,
  type CreateCategoryInput,
  type UpdateCategoryInput,
  type AuthUser,
  type CategoryDto,
  type StaffCategoryDto,
} from "@cometkit/shared";
import { CategoriesService } from "./categories.service";
import { toCategoryDto, toStaffCategoryDto } from "./categories.policy";

@Controller("categories")
@UseGuards(JwtAuthGuard, RolesGuard)
export class CategoriesController {
  constructor(private readonly service: CategoriesService) {}

  @Get()
  async list(
    @CurrentUser() user: AuthUser,
    @Query("providerId") providerId: string,
    @Query("productType") productType?: string,
  ): Promise<(CategoryDto | StaffCategoryDto)[]> {
    const rows = await this.service.list(providerId, productType);
    return rows.map((r) => (user.role === "admin" ? toCategoryDto(r) : toStaffCategoryDto(r)));
  }

  @Post()
  @Roles("admin")
  async create(
    @Body(new ZodValidationPipe(createCategorySchema)) input: CreateCategoryInput,
  ): Promise<CategoryDto> {
    return toCategoryDto(await this.service.create(input));
  }

  @Patch(":id")
  @Roles("admin")
  async update(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateCategorySchema)) input: UpdateCategoryInput,
  ): Promise<CategoryDto> {
    return toCategoryDto(await this.service.update(id, input));
  }

  @Delete(":id")
  @Roles("admin")
  async remove(@Param("id") id: string): Promise<{ ok: true }> {
    await this.service.remove(id);
    return { ok: true };
  }
}
