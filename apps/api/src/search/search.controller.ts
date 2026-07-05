import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../auth/roles.decorator";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import {
  searchPackagesSchema,
  type SearchParams,
  type SearchResultDto,
  type Paginated,
} from "@cometkit/shared";
import { SearchService } from "./search.service";

@Controller("search")
@UseGuards(JwtAuthGuard, RolesGuard)
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get("packages")
  @Roles("admin", "staff")
  async searchPackages(
    @Query(new ZodValidationPipe(searchPackagesSchema)) params: SearchParams,
  ): Promise<Paginated<SearchResultDto>> {
    return this.searchService.search(params);
  }
}
