import { Module } from "@nestjs/common";
import { StorageModule } from "../storage/storage.module";
import { ProvidersController } from "./providers.controller";
import { ProvidersService, PROVIDER_CASCADE_SERVICE_TOKEN } from "./providers.service";

@Module({
  imports: [StorageModule],
  controllers: [ProvidersController],
  providers: [
    ProvidersService,
    {
      provide: PROVIDER_CASCADE_SERVICE_TOKEN,
      useValue: {
        getAffectedPackages: async () => [],
        unpublishPackages: async () => {},
      },
    },
  ],
  exports: [ProvidersService],
})
export class ProvidersModule {}
