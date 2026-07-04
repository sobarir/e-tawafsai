import {
  Global,
  MiddlewareConsumer,
  Module,
  NestModule,
  RequestMethod,
} from "@nestjs/common";
import { TenantRegistryService } from "./tenant-registry.service";
import { TenantScopedDb } from "./tenant-scoped-db";
import { TenantResolutionMiddleware } from "./tenant-resolution.middleware";

@Global()
@Module({
  providers: [TenantScopedDb, TenantRegistryService],
  exports: [TenantScopedDb, TenantRegistryService],
})
export class TenancyModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(TenantResolutionMiddleware)
      .exclude({ path: "health", method: RequestMethod.ALL })
      .forRoutes("*");
  }
}
