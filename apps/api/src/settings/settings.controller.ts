import { Body, Controller, Get, Patch, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../auth/roles.decorator";
import { SettingsService } from "./settings.service";
import { CurrentUser } from "../auth/current-user.decorator";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { settingsInputSchema, type SettingsInput, type AuthUser } from "@cometkit/shared";

@Controller("settings")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("admin")
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  get(@CurrentUser() user: AuthUser) {
    return this.settingsService.getSettings(user.tenantId);
  }

  @Patch()
  update(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(settingsInputSchema)) input: SettingsInput,
  ) {
    return this.settingsService.updateSettings(user.tenantId, input);
  }
}

