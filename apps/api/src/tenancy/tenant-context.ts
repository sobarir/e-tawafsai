import { InternalServerErrorException } from "@nestjs/common";

/** CLS key under which the active tenant id is stored for a request. */
export const TENANT_ID_KEY = "tenantId";

/**
 * Thrown when a tenant-owned data access is attempted with no tenant context.
 * 500 (not 4xx): reaching the data layer without a resolved tenant is a
 * server-side wiring bug, never a client input error.
 */
export class TenantContextMissingError extends InternalServerErrorException {
  constructor() {
    super("Tenant context is required but was not established for this request");
  }
}
