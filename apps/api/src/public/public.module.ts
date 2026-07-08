import { Module } from "@nestjs/common";
import { PublicPackagesController } from "./public-packages.controller";
import { PublicPackagesService } from "./public-packages.service";

@Module({
  controllers: [PublicPackagesController],
  providers: [PublicPackagesService],
})
export class PublicModule {}
