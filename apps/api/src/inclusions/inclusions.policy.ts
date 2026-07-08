import type { DbInclusion } from "@cometkit/db";
import type { InclusionDto } from "@cometkit/shared";

export function normalizeInclusionName(name: string): string {
  return name.trim().toLowerCase();
}

export function toInclusionDto(row: DbInclusion): InclusionDto {
  return {
    id: row.id,
    tenantId: row.tenantId,
    name: row.name,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
