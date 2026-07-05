import { Body, Controller, Get, Param, Patch, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../auth/roles.decorator";
import { SettingsService } from "./settings.service";
import { CurrentUser } from "../auth/current-user.decorator";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { templateInputSchema, type TemplateInput, type AuthUser } from "@cometkit/shared";

@Controller("settings/templates")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("admin")
export class TemplatesController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.settingsService.getTemplates(user.tenantId);
  }

  @Patch(":key")
  update(
    @CurrentUser() user: AuthUser,
    @Param("key") key: string,
    @Body(new ZodValidationPipe(templateInputSchema)) input: TemplateInput,
  ) {
    return this.settingsService.updateTemplate(user.tenantId, key, input.label, input.body);
  }
}
