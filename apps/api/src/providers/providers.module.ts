import { Module, forwardRef } from "@nestjs/common";
import { StorageModule } from "../storage/storage.module";
import { ProvidersController } from "./providers.controller";
import { ProvidersService, PROVIDER_CASCADE_SERVICE_TOKEN } from "./providers.service";
import { PackagesModule, PackagesCascadeService } from "../packages/packages.module";

@Module({
  imports: [StorageModule, forwardRef(() => PackagesModule)],
  controllers: [ProvidersController],
  providers: [
    ProvidersService,
    {
      provide: PROVIDER_CASCADE_SERVICE_TOKEN,
      useClass: PackagesCascadeService,
    },
  ],
  exports: [ProvidersService],
})
export class ProvidersModule {}

