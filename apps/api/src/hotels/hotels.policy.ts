import type { DbHotel } from "@cometkit/db";
import type { HotelDto } from "@cometkit/shared";

export function normalizeHotelName(name: string): string {
  return name.trim().toLowerCase();
}

export function toHotelDto(row: DbHotel): HotelDto {
  return {
    id: row.id,
    tenantId: row.tenantId,
    name: row.name,
    city: row.city,
    stars: row.stars,
    distanceM: row.distanceM,
    isPelataran: row.isPelataran,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
