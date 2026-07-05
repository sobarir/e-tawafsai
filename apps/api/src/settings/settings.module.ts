import { Module } from "@nestjs/common";
import { SettingsController } from "./settings.controller";
import { TemplatesController } from "./templates.controller";
import { SettingsService } from "./settings.service";

@Module({
  controllers: [SettingsController, TemplatesController],
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}

