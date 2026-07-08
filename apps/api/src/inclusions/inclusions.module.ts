import { Module } from "@nestjs/common";
import { InclusionsController } from "./inclusions.controller";
import { InclusionsService } from "./inclusions.service";

@Module({
  controllers: [InclusionsController],
  providers: [InclusionsService],
  exports: [InclusionsService],
})
export class InclusionsModule {}
