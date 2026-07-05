import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
  BadRequestException,
  NotFoundException,
} from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../auth/roles.decorator";
import { CurrentUser } from "../auth/current-user.decorator";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import {
  createProviderSchema,
  updateProviderSchema,
  activateProviderSchema,
  type CreateProviderInput,
  type UpdateProviderInput,
  type AuthUser,
  type ProviderDto,
  type StaffProviderDto,
} from "@cometkit/shared";
import { ProvidersService } from "./providers.service";
import { toProviderDto, toStaffProviderDto } from "./providers.policy";
import { StorageService } from "../storage/storage.service";

@Controller("providers")
@UseGuards(JwtAuthGuard, RolesGuard)
export class ProvidersController {
  constructor(
    private readonly providersService: ProvidersService,
    private readonly storageService: StorageService,
  ) {}

  @Post()
  @Roles("admin")
  async create(
    @Body(new ZodValidationPipe(createProviderSchema)) input: CreateProviderInput,
  ): Promise<ProviderDto> {
    const row = await this.providersService.create(input);
    return toProviderDto(row);
  }

  @Get()
  async list(
    @CurrentUser() user: AuthUser,
    @Query() query: Record<string, string | undefined>,
  ) {
    const page = Number(query.page || 1);
    const limit = Number(query.limit || 10);
    const paginated = await this.providersService.list({ page, limit });
    
    const mapped = paginated.data.map((row) =>
      user.role === "admin" ? toProviderDto(row) : toStaffProviderDto(row)
    );

    return {
      data: mapped,
      meta: paginated.meta,
    };
  }

  @Get(":id")
  async findOne(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
  ): Promise<ProviderDto | StaffProviderDto> {
    const row = await this.providersService.findById(id);
    if (!row) throw new NotFoundException("Provider not found");

    return user.role === "admin" ? toProviderDto(row) : toStaffProviderDto(row);
  }

  @Patch(":id")
  @Roles("admin")
  async update(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateProviderSchema)) input: UpdateProviderInput,
  ): Promise<ProviderDto> {
    const row = await this.providersService.update(id, input);
    return toProviderDto(row);
  }

  @Post(":id/activate")
  @Roles("admin")
  async activate(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(activateProviderSchema))
    input: { ppiuLicenseNo?: string | null; pihkLicenseNo?: string | null; consentConfirmed: boolean },
  ): Promise<ProviderDto> {
    const row = await this.providersService.activate(id, input);
    return toProviderDto(row);
  }

  @Post(":id/deactivate")
  @Roles("admin")
  async deactivate(
    @Param("id") id: string,
  ): Promise<{ provider: ProviderDto; affectedPackages: { id: string; name: string }[] }> {
    const res = await this.providersService.deactivate(id);
    return {
      provider: toProviderDto(res.provider),
      affectedPackages: res.affectedPackages,
    };
  }

  @Post("upload-logo")
  @Roles("admin")
  async uploadLogo(
    @CurrentUser() user: AuthUser,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    @Req() req: any,
  ) {
    const file = await req.file();
    if (!file) throw new BadRequestException("No file uploaded");

    const buffer = await file.toBuffer();
    const url = await this.storageService.uploadFile(
      buffer,
      file.filename,
      file.mimetype,
      user.tenantId,
    );

    return { url };
  }
}
