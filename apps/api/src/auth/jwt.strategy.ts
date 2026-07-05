import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { ClsService } from "nestjs-cls";
import { ExtractJwt, Strategy } from "passport-jwt";
import type { FastifyRequest } from "fastify";
import type { AuthUser } from "@cometkit/shared";
import { UsersService } from "../users/users.service";
import { TENANT_ID_KEY } from "../tenancy/tenant-context";
import { SESSION_COOKIE } from "./session-cookie";

function fromCookie(req: FastifyRequest): string | null {
  return req.cookies?.[SESSION_COOKIE] ?? null;
}

export interface JwtPayload {
  sub: string;
  email: string;
  tenantId: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly users: UsersService,
    private readonly cls: ClsService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        fromCookie as (req: unknown) => string | null,
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>("JWT_SECRET"),
    });
  }

  async validate(payload: JwtPayload): Promise<AuthUser> {
    // Establish tenant context BEFORE any tenant-owned read.
    this.cls.set(TENANT_ID_KEY, payload.tenantId);
    // Scoped by the active tenant: a user whose tenant changed resolves to
    // undefined -> 401 (same spirit as the existing role-freshness behavior).
    const user = await this.users.findById(payload.sub);
    if (!user || !user.isActive) {
      throw new UnauthorizedException();
    }
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      tenantId: user.tenantId,
    };
  }
}
