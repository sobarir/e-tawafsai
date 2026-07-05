import * as z from "zod";

export const TEMPLATE_ALLOWED_VARIABLES: Record<string, string[]> = {
  greeting: ["{customerName}", "{agentName}"],
  price_quote: ["{customerName}", "{packageName}", "{packagePrice}"],
  dp_reminder: ["{customerName}", "{packageName}", "{dpAmount}"],
  h60_reminder: ["{customerName}", "{packageName}", "{departureDate}"],
  h30_reminder: ["{customerName}", "{packageName}", "{remainingAmount}", "{dueDate}"],
  doc_checklist: ["{customerName}", "{checklistItems}"],
  testimonial_ask: ["{customerName}", "{packageName}"],
};

export const settingsInputSchema = z.object({
  metaPixelId: z.string().max(255).nullable().default(null),
  googleTagId: z.string().max(255).nullable().default(null),
  almostFullThreshold: z.number().int().positive().default(5),
  holdExpiryHours: z.number().int().positive().default(48),
  followUpLeadDays: z.number().int().positive().default(2),
  followUpQuoteDays: z.number().int().positive().default(3),
  followUpDpReminderDays: z.number().int().positive().default(7),
  followUpFullPaymentDays: z.number().int().positive().default(14),
  brandName: z.string().min(1).max(120),
  brandLogoUrl: z.string().url().max(2048).nullable().default(null),
  waNumber: z.string().max(32).nullable().default(null),
  additionalWaNumbers: z.array(
    z.object({
      waNumber: z.string().max(32),
      label: z.string().max(120),
    }),
  ).default([]),
});

export type SettingsInput = z.infer<typeof settingsInputSchema>;

export const templateInputSchema = z.object({
  key: z.string().min(1).max(63),
  label: z.string().min(1).max(120),
  body: z.string().min(1),
}).refine((data) => {
  const allowed = TEMPLATE_ALLOWED_VARIABLES[data.key] || [];
  const placeholders = data.body.match(/\{[^}]+\}/g) || [];
  return placeholders.every((ph) => allowed.includes(ph));
}, {
  message: "Body contains unauthorized placeholders",
  path: ["body"],
});

export type TemplateInput = z.infer<typeof templateInputSchema>;

export interface SettingsDto {
  id: string;
  tenantId: string;
  metaPixelId: string | null;
  googleTagId: string | null;
  almostFullThreshold: number;
  holdExpiryHours: number;
  followUpLeadDays: number;
  followUpQuoteDays: number;
  followUpDpReminderDays: number;
  followUpFullPaymentDays: number;
  brandName: string;
  brandLogoUrl: string | null;
  waNumber: string | null;
  additionalWaNumbers: { waNumber: string; label: string }[];
  createdAt: string;
  updatedAt: string;
}

export interface MessageTemplateDto {
  id: string;
  tenantId: string;
  key: string;
  label: string;
  body: string;
  createdAt: string;
  updatedAt: string;
}

