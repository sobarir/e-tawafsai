import { Module } from "@nestjs/common";
import { DeparturesController } from "./departures.controller";
import { DeparturesService } from "./departures.service";
import { DeparturesCron } from "./departures.cron";

@Module({
  controllers: [DeparturesController],
  providers: [DeparturesService, DeparturesCron],
  exports: [DeparturesService],
})
export class DeparturesModule {}
