import type { DbDepartureCity } from "@cometkit/db";
import type { DepartureCityDto } from "@cometkit/shared";

export function normalizeDepartureCityName(name: string): string {
  return name.trim().toLowerCase();
}

export function toDepartureCityDto(row: DbDepartureCity): DepartureCityDto {
  return {
    id: row.id,
    tenantId: row.tenantId,
    name: row.name,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
