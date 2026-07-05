import type { Provider } from "@cometkit/db";
import type { ProviderDto, StaffProviderDto } from "@cometkit/shared";

export function toProviderDto(row: Provider): ProviderDto {
  return {
    id: row.id,
    tenantId: row.tenantId,
    name: row.name,
    brandName: row.brandName,
    ppiuLicenseNo: row.ppiuLicenseNo,
    pihkLicenseNo: row.pihkLicenseNo,
    accreditation: row.accreditation,
    contactPerson: row.contactPerson,
    contactPhone: row.contactPhone,
    logoUrl: row.logoUrl,
    allowLogoOnPublicPages: row.allowLogoOnPublicPages,
    defaultCommissionType: row.defaultCommissionType,
    defaultCommissionValue: row.defaultCommissionValue,
    commissionNotes: row.commissionNotes,
    isActive: row.isActive,
    pricePublicationConsentAt: row.pricePublicationConsentAt
      ? row.pricePublicationConsentAt.toISOString()
      : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toStaffProviderDto(row: Provider): StaffProviderDto {
  const dto = toProviderDto(row);
  
  // Explicitly delete commission fields for staff access
  const staffDto: Record<string, unknown> = { ...dto } as unknown as Record<string, unknown>;
  delete staffDto.defaultCommissionType;
  delete staffDto.defaultCommissionValue;
  delete staffDto.commissionNotes;

  return staffDto as unknown as StaffProviderDto;
}
