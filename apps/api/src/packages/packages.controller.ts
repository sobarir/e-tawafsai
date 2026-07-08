import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
  BadRequestException,
  Inject,
} from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../auth/roles.decorator";
import { CurrentUser } from "../auth/current-user.decorator";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import {
  createPackageSchema,
  updatePackageSchema,
  attachHotelSchema,
  type CreatePackageInput,
  type UpdatePackageInput,
  type AuthUser,
  type PackageDto,
  type HotelInput,
} from "@cometkit/shared";
import { PackagesService } from "./packages.service";
import { StorageService } from "../storage/storage.service";
import { TenantScopedDb } from "../tenancy/tenant-scoped-db";
import { tags, type Database } from "@cometkit/db";
import { eq, and } from "drizzle-orm";
import { ulid } from "ulid";
import { DB } from "../database/database.module";

@Controller("packages")
@UseGuards(JwtAuthGuard, RolesGuard)
export class PackagesController {
  constructor(
    private readonly packagesService: PackagesService,
    private readonly storageService: StorageService,
    private readonly tenantDb: TenantScopedDb,
    @Inject(DB) private readonly db: Database,
  ) {}

  @Post()
  @Roles("admin")
  async create(
    @Body(new ZodValidationPipe(createPackageSchema)) input: CreatePackageInput,
  ): Promise<PackageDto> {
    const created = await this.packagesService.create(input);
    return this.packagesService.findOne(created.id);
  }

  @Get()
  async list(): Promise<PackageDto[]> {
    return this.packagesService.findAll();
  }

  @Get("tags")
  async listTags() {
    const list = await this.db
      .select()
      .from(tags)
      .where(eq(tags.tenantId, this.tenantDb.tenantId));
    return list;
  }

  @Post("tags")
  @Roles("admin")
  async createTag(
    @Body() body: { name: string },
  ) {
    if (!body.name) {
      throw new BadRequestException("Tag name is required");
    }
    const [existing] = await this.db
      .select()
      .from(tags)
      .where(and(eq(tags.tenantId, this.tenantDb.tenantId), eq(tags.name, body.name)))
      .limit(1);

    if (existing) {
      return existing;
    }

    const [created] = await this.db
      .insert(tags)
      .values({
        id: ulid(),
        tenantId: this.tenantDb.tenantId,
        name: body.name,
      })
      .returning();

    return created;
  }

  @Get(":id")
  async findOne(@Param("id") id: string): Promise<PackageDto> {
    return this.packagesService.findOne(id);
  }

  @Patch(":id")
  @Roles("admin")
  async update(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updatePackageSchema)) input: UpdatePackageInput,
  ): Promise<PackageDto> {
    await this.packagesService.update(id, input);
    return this.packagesService.findOne(id);
  }

  @Post(":id/hotels")
  @Roles("admin")
  async addHotel(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(attachHotelSchema)) hotel: HotelInput,
  ) {
    return this.packagesService.addHotel(id, hotel);
  }

  @Delete(":id/hotels/:hotelId")
  @Roles("admin")
  async removeHotel(
    @Param("id") id: string,
    @Param("hotelId") hotelId: string,
  ): Promise<{ ok: true }> {
    await this.packagesService.removeHotel(id, hotelId);
    return { ok: true };
  }

  @Post(":id/publish")
  @Roles("admin")
  async publish(@Param("id") id: string): Promise<PackageDto> {
    await this.packagesService.publish(id);
    return this.packagesService.findOne(id);
  }

  @Post(":id/unpublish")
  @Roles("admin")
  async unpublish(@Param("id") id: string): Promise<PackageDto> {
    await this.packagesService.unpublish(id);
    return this.packagesService.findOne(id);
  }

  @Post("upload-flyer")
  @Roles("admin")
  async uploadFlyer(
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
