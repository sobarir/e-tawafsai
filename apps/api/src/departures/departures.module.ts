import { Module } from "@nestjs/common";
import { DeparturesController } from "./departures.controller";
import { DeparturesService } from "./departures.service";

@Module({
  controllers: [DeparturesController],
  providers: [DeparturesService],
  exports: [DeparturesService],
})
export class DeparturesModule {}
