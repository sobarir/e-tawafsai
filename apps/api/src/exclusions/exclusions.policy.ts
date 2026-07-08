import type { DbExclusion } from "@cometkit/db";
import type { ExclusionDto } from "@cometkit/shared";

export function normalizeExclusionName(name: string): string {
  return name.trim().toLowerCase();
}

export function toExclusionDto(row: DbExclusion): ExclusionDto {
  return {
    id: row.id,
    tenantId: row.tenantId,
    name: row.name,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
