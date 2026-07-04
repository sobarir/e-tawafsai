import { Injectable, NestMiddleware, NotFoundException } from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";
import { ClsService } from "nestjs-cls";
import { DEFAULT_TENANT_SLUG } from "@cometkit/shared";
import { TENANT_ID_KEY } from "./tenant-context";
import { TenantRegistryService } from "./tenant-registry.service";

/**
 * Derive a tenant slug from a request host. Apex, `www`, and `localhost`
 * resolve to the default tenant; `{slug}.domain` resolves to `{slug}`.
 */
export function slugFromHost(host: string | undefined): string {
  if (!host) return DEFAULT_TENANT_SLUG;
  const hostname = (host.split(":")[0] ?? host).toLowerCase();
  const labels = hostname.split(".");
  // localhost / apex (example.com) / single label -> default
  if (hostname === "localhost" || labels.length < 3) {
    // `{slug}.localhost` is a 2-label host we still want to split.
    if (labels.length === 2 && labels[1] === "localhost") {
      const first = labels[0] ?? DEFAULT_TENANT_SLUG;
      return first === "www" ? DEFAULT_TENANT_SLUG : first;
    }
    return DEFAULT_TENANT_SLUG;
  }
  const sub = labels[0] ?? DEFAULT_TENANT_SLUG;
  return sub === "www" ? DEFAULT_TENANT_SLUG : sub;
}

@Injectable()
export class TenantResolutionMiddleware implements NestMiddleware {
  constructor(
    private readonly registry: TenantRegistryService,
    private readonly cls: ClsService,
  ) {}

  async use(
    req: FastifyRequest["raw"] & { headers: Record<string, string | undefined> },
    _res: FastifyReply["raw"],
    next: (err?: unknown) => void,
  ): Promise<void> {
    // Authenticated requests resolve tenant from the JWT (JwtStrategy); leave them.
    if (req.headers["authorization"]) return next();

    const host = req.headers["x-forwarded-host"] ?? req.headers["host"];
    const slug = slugFromHost(host);
    const tenant = await this.registry.findBySlug(slug);
    if (!tenant) {
      return next(new NotFoundException("Unknown tenant"));
    }
    this.cls.set(TENANT_ID_KEY, tenant.id);
    return next();
  }
}
