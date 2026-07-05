import { Inject, Injectable } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { tenants, tenantSettings, tenantWaNumbers, type Database } from "@cometkit/db";
import type { SettingsInput } from "@cometkit/shared";
import { ulid } from "ulid";
import { DB } from "../database/database.module";

@Injectable()
export class SettingsService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async getSettings(tenantId: string) {
    let settings = await this.db.query.tenantSettings.findFirst({
      where: eq(tenantSettings.tenantId, tenantId),
    });

    if (!settings) {
      settings = {
        id: ulid(),
        tenantId,
        metaPixelId: null,
        googleTagId: null,
        almostFullThreshold: 5,
        holdExpiryHours: 48,
        followUpLeadDays: 2,
        followUpQuoteDays: 3,
        followUpDpReminderDays: 7,
        followUpFullPaymentDays: 14,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      await this.db.insert(tenantSettings).values(settings);
    }

    const tenant = await this.db.query.tenants.findFirst({
      where: eq(tenants.id, tenantId),
    });

    const additionalWa = await this.db.query.tenantWaNumbers.findMany({
      where: eq(tenantWaNumbers.tenantId, tenantId),
    });

    return {
      ...settings,
      brandName: tenant?.brandName ?? "",
      brandLogoUrl: tenant?.brandLogoUrl ?? null,
      waNumber: tenant?.waNumber ?? null,
      additionalWaNumbers: additionalWa.map((w) => ({
        waNumber: w.waNumber,
        label: w.label,
      })),
    };
  }

  async updateSettings(tenantId: string, input: SettingsInput) {
    await this.getSettings(tenantId); // ensures settings row exists

    await this.db
      .update(tenantSettings)
      .set({
        metaPixelId: input.metaPixelId,
        googleTagId: input.googleTagId,
        almostFullThreshold: input.almostFullThreshold,
        holdExpiryHours: input.holdExpiryHours,
        followUpLeadDays: input.followUpLeadDays,
        followUpQuoteDays: input.followUpQuoteDays,
        followUpDpReminderDays: input.followUpDpReminderDays,
        followUpFullPaymentDays: input.followUpFullPaymentDays,
        updatedAt: new Date(),
      })
      .where(eq(tenantSettings.tenantId, tenantId));

    await this.db
      .update(tenants)
      .set({
        brandName: input.brandName,
        brandLogoUrl: input.brandLogoUrl,
        waNumber: input.waNumber,
        updatedAt: new Date(),
      })
      .where(eq(tenants.id, tenantId));

    await this.db.delete(tenantWaNumbers).where(eq(tenantWaNumbers.tenantId, tenantId));

    if (input.additionalWaNumbers && input.additionalWaNumbers.length > 0) {
      await this.db.insert(tenantWaNumbers).values(
        input.additionalWaNumbers.map((wa) => ({
          id: ulid(),
          tenantId,
          waNumber: wa.waNumber,
          label: wa.label,
          createdAt: new Date(),
          updatedAt: new Date(),
        })),
      );
    }

    return this.getSettings(tenantId);
  }
}
