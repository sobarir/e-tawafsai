import type { DbPackageCategory } from "@cometkit/db";
import type { CategoryDto, StaffCategoryDto } from "@cometkit/shared";

export function normalizeCategoryName(name: string): string {
  return name.trim().toLowerCase();
}

export function categoryMatchesScope(
  cat: Pick<DbPackageCategory, "providerId" | "productType">,
  providerId: string,
  productType: string,
): boolean {
  return cat.providerId === providerId && cat.productType === productType;
}

export function toCategoryDto(row: DbPackageCategory): CategoryDto {
  return {
    id: row.id,
    tenantId: row.tenantId,
    providerId: row.providerId,
    productType: row.productType,
    name: row.name,
    commissionType: row.commissionType,
    commissionValue: row.commissionValue,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toStaffCategoryDto(row: DbPackageCategory): StaffCategoryDto {
  const dto: Record<string, unknown> = { ...toCategoryDto(row) };
  delete dto.commissionType;
  delete dto.commissionValue;
  return dto as unknown as StaffCategoryDto;
}
