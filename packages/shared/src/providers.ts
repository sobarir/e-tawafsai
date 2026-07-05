import * as z from "zod";

export const ACCREDITATIONS = ["A", "B", "C", "unknown"] as const;
export const COMMISSION_TYPES = ["flat_per_pax", "percent_of_price"] as const;

export const createProviderSchema = z.object({
  name: z.string().min(1).max(255),
  brandName: z.string().min(1).max(255),
  ppiuLicenseNo: z.string().max(100).nullable().optional(),
  pihkLicenseNo: z.string().max(100).nullable().optional(),
  accreditation: z.enum(ACCREDITATIONS).default("unknown"),
  contactPerson: z.string().min(1).max(255),
  contactPhone: z.string().min(1).max(32),
  logoUrl: z.string().url().max(2048).nullable().optional(),
  allowLogoOnPublicPages: z.boolean().default(false),
  defaultCommissionType: z.enum(COMMISSION_TYPES).default("flat_per_pax"),
  defaultCommissionValue: z.number().int().nonnegative().default(0),
  commissionNotes: z.string().nullable().optional(),
});

export const updateProviderSchema = createProviderSchema.partial();

export const activateProviderSchema = z.object({
  ppiuLicenseNo: z.string().max(100).nullable().optional(),
  pihkLicenseNo: z.string().max(100).nullable().optional(),
  consentConfirmed: z.boolean().refine((val) => val === true, {
    message: "Consent for price publication must be confirmed to activate",
  }),
});

export interface ProviderDto {
  id: string;
  tenantId: string;
  name: string;
  brandName: string;
  ppiuLicenseNo: string | null;
  pihkLicenseNo: string | null;
  accreditation: string;
  contactPerson: string;
  contactPhone: string;
  logoUrl: string | null;
  allowLogoOnPublicPages: boolean;
  defaultCommissionType: string;
  defaultCommissionValue: number;
  commissionNotes: string | null;
  isActive: boolean;
  pricePublicationConsentAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type StaffProviderDto = Omit<
  ProviderDto,
  "defaultCommissionType" | "defaultCommissionValue" | "commissionNotes"
>;
