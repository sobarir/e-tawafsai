import type { DbAirline } from "@cometkit/db";
import type { AirlineDto } from "@cometkit/shared";

export function normalizeAirlineName(name: string): string {
  return name.trim().toLowerCase();
}

export function toAirlineDto(row: DbAirline): AirlineDto {
  return {
    id: row.id,
    tenantId: row.tenantId,
    name: row.name,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
