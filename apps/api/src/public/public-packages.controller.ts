import { Controller, Get } from "@nestjs/common";
import type { PublicPackageCardDto } from "@cometkit/shared";
import { PublicPackagesService } from "./public-packages.service";

/**
 * Public, UNAUTHENTICATED landing catalog. No guards — the tenant is resolved from the
 * request host by the app-wide TenantResolutionMiddleware. Returns only published,
 * marketing-safe package cards.
 */
@Controller("public/packages")
export class PublicPackagesController {
  constructor(private readonly service: PublicPackagesService) {}

  @Get()
  async featured(): Promise<PublicPackageCardDto[]> {
    return this.service.featured(6);
  }
}
