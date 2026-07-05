---
change: tenant-settings
design-doc: docs/superpowers/specs/2026-07-05-tenant-settings-design.md
base-ref: 32a180ad4cf324684684aa823bcdf11f92449a08
archived-with: 2026-07-05-tenant-settings
---

# tenant-settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Implement tenant-scoped settings (Meta Pixel/Google Tag, thresholds, pipeline intervals), custom WA numbers, and message template library with Indonesia starter seed, admin-only access, and integration into the inventory status engine.

**Architecture:** Use typed PostgreSQL tables for core settings, WhatsApp numbers, and message templates. Protect routes via RolesGuard, implement a lazy settings upsert mechanism, and cache the threshold settings for hot paths.

**Tech Stack:** NestJS, Drizzle ORM, Fastify, Next.js, Zod, TanStack Query, ky.

## Global Constraints
- Core settings schema validation lives in `packages/shared`.
- Database schemas live in `packages/db`.
- API endpoints are protected using `@Roles("admin")` fresh RBAC checking.
- Next.js web client uses `proxy.ts` routing gate instead of middleware.

archived-with: 2026-07-05-tenant-settings
---

## Tasks

### Task 1: Shared Schema Contracts & Validation

**Files:**
- Create: `packages/shared/src/settings.ts`
- Modify: `packages/shared/src/index.ts`

**Interfaces:**
- Produces: `settingsInputSchema`, `templateInputSchema`, `TEMPLATE_ALLOWED_VARIABLES`

- [x] **Step 1: Create shared settings file**
  Create `packages/shared/src/settings.ts` with:
  ```ts
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
    additionalWaNumbers: z.array(z.object({
      waNumber: z.string().max(32),
      label: z.string().max(120),
    })).default([]),
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
  ```

- [x] **Step 2: Export from shared package**
  Add export to `packages/shared/src/index.ts`:
  ```ts
  export * from "./settings";
  ```

- [x] **Step 3: Run verify**
  Run: `bun run verify`
  Expected: PASS

- [x] **Step 4: Commit**
  ```bash
  git add packages/shared/src
  git commit -m "feat(tenant-settings): add shared settings and template validation schemas"
  ```

archived-with: 2026-07-05-tenant-settings
---

### Task 2: Database Schema & Seeding

**Files:**
- Modify: `packages/db/src/schema/tenants.ts`
- Modify: `packages/db/src/seed.ts`

**Interfaces:**
- Produces: `tenantSettings`, `tenantWaNumbers`, `messageTemplates` tables

- [x] **Step 1: Add Drizzle schema definitions**
  Modify `packages/db/src/schema/tenants.ts` to add the tables:
  ```ts
  import { pgTable, varchar, integer, text, unique } from "drizzle-orm/pg-core";
  import { timestamps, ulidPk, ulidRef } from "../columns";

  export const tenantSettings = pgTable("tenant_settings", {
    id: ulidPk(),
    tenantId: ulidRef("tenant_id")
      .notNull()
      .unique()
      .references(() => tenants.id),
    metaPixelId: varchar("meta_pixel_id", { length: 255 }),
    googleTagId: varchar("google_tag_id", { length: 255 }),
    almostFullThreshold: integer("almost_full_threshold").notNull().default(5),
    holdExpiryHours: integer("hold_expiry_hours").notNull().default(48),
    followUpLeadDays: integer("follow_up_lead_days").notNull().default(2),
    followUpQuoteDays: integer("follow_up_quote_days").notNull().default(3),
    followUpDpReminderDays: integer("follow_up_dp_reminder_days").notNull().default(7),
    followUpFullPaymentDays: integer("follow_up_full_payment_days").notNull().default(14),
    ...timestamps,
  });

  export const tenantWaNumbers = pgTable("tenant_wa_numbers", {
    id: ulidPk(),
    tenantId: ulidRef("tenant_id")
      .notNull()
      .references(() => tenants.id),
    waNumber: varchar("wa_number", { length: 32 }).notNull(),
    label: varchar("label", { length: 120 }).notNull(),
    ...timestamps,
  });

  export const messageTemplates = pgTable("message_templates", {
    id: ulidPk(),
    tenantId: ulidRef("tenant_id")
      .notNull()
      .references(() => tenants.id),
    key: varchar("key", { length: 63 }).notNull(),
    label: varchar("label", { length: 120 }).notNull(),
    body: text("body").notNull(),
    ...timestamps,
  }, (table) => [
    unique("message_templates_tenant_key_idx").on(table.tenantId, table.key),
  ]);
  ```

- [x] **Step 2: Generate and apply migrations**
  Run: `bun run db:generate`
  Run: `bun run db:migrate`
  Expected: Migration succeeds and updates local DB schema.

- [x] **Step 3: Update seed script**
  Modify `packages/db/src/seed.ts` to insert initial message templates for the default tenant:
  ```ts
  import { messageTemplates } from "./schema/tenants";
  import { ulid } from "ulid";

  // Inside seed main function, insert template starters:
  await db.insert(messageTemplates).values([
    {
      id: ulid(),
      tenantId: defaultTenant.id,
      key: "greeting",
      label: "Greeting Template",
      body: "Halo {customerName}, selamat datang! Saya {agentName} akan membantu Anda hari ini.",
    },
    {
      id: ulid(),
      tenantId: defaultTenant.id,
      key: "price_quote",
      label: "Price Quote Template",
      body: "Halo {customerName}, berikut penawaran harga untuk paket {packageName}: Rp {packagePrice}.",
    }
  ]).onConflictDoNothing();
  ```

- [x] **Step 4: Seed DB**
  Run: `bun run db:seed`
  Expected: Seed runs successfully.

- [x] **Step 5: Commit**
  ```bash
  git add packages/db
  git commit -m "feat(tenant-settings): add tables, run migrations, and seed starter templates"
  ```

archived-with: 2026-07-05-tenant-settings
---

### Task 3: Backend Settings Service & Controller

**Files:**
- Create: `apps/api/src/settings/settings.service.ts`
- Create: `apps/api/src/settings/settings.controller.ts`
- Create: `apps/api/src/settings/settings.module.ts`
- Modify: `apps/api/src/app.module.ts`

**Interfaces:**
- Produces: `SettingsService.getSettings()`, `SettingsService.updateSettings()`, endpoints `GET /settings`, `PATCH /settings`

- [x] **Step 1: Create Settings Service**
  Create `apps/api/src/settings/settings.service.ts` implementing lazy upsert on read:
  ```ts
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
        additionalWaNumbers: additionalWa.map(w => ({ waNumber: w.waNumber, label: w.label })),
      };
    }

    async updateSettings(tenantId: string, input: SettingsInput) {
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
        })
        .where(eq(tenantSettings.tenantId, tenantId));

      await this.db
        .update(tenants)
        .set({
          brandName: input.brandName,
          brandLogoUrl: input.brandLogoUrl,
          waNumber: input.waNumber,
        })
        .where(eq(tenants.id, tenantId));

      await this.db.delete(tenantWaNumbers).where(eq(tenantWaNumbers.tenantId, tenantId));

      if (input.additionalWaNumbers.length > 0) {
        await this.db.insert(tenantWaNumbers).values(
          input.additionalWaNumbers.map((wa) => ({
            id: ulid(),
            tenantId,
            waNumber: wa.waNumber,
            label: wa.label,
          })),
        );
      }

      return this.getSettings(tenantId);
    }
  }
  ```

- [x] **Step 2: Create Settings Controller**
  Create `apps/api/src/settings/settings.controller.ts` with roles guard:
  ```ts
  import { Body, Controller, Get, Patch, UseGuards } from "@nestjs/common";
  import { JwtAuthGuard } from "../auth/jwt-auth.guard";
  import { RolesGuard } from "../auth/roles.guard";
  import { Roles } from "../auth/roles.decorator";
  import { SettingsService } from "./settings.service";
  import { TenantId } from "../tenancy/tenant-id.decorator";
  import { ZodValidationPipe } from "../common/zod-validation.pipe";
  import { settingsInputSchema, type SettingsInput } from "@cometkit/shared";

  @Controller("settings")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin")
  export class SettingsController {
    constructor(private readonly settingsService: SettingsService) {}

    @Get()
    get(@TenantId() tenantId: string) {
      return this.settingsService.getSettings(tenantId);
    }

    @Patch()
    update(
      @TenantId() tenantId: string,
      @Body(new ZodValidationPipe(settingsInputSchema)) input: SettingsInput,
    ) {
      return this.settingsService.updateSettings(tenantId, input);
    }
  }
  ```

- [x] **Step 3: Create module and register in app module**
  Create `apps/api/src/settings/settings.module.ts`:
  ```ts
  import { Module } from "@nestjs/common";
  import { SettingsController } from "./settings.controller";
  import { SettingsService } from "./settings.service";

  @Module({
    controllers: [SettingsController],
    providers: [SettingsService],
    exports: [SettingsService],
  })
  export class SettingsModule {}
  ```
  Modify `apps/api/src/app.module.ts` to import `SettingsModule`.

- [x] **Step 4: Commit**
  ```bash
  git add apps/api/src/settings apps/api/src/app.module.ts
  git commit -m "feat(tenant-settings): settings backend endpoints with admin roles guard"
  ```

archived-with: 2026-07-05-tenant-settings
---

### Task 4: Backend Message Templates Endpoints

**Files:**
- Create: `apps/api/src/settings/templates.controller.ts`
- Modify: `apps/api/src/settings/settings.module.ts`
- Modify: `apps/api/src/settings/settings.service.ts`

**Interfaces:**
- Produces: `GET /settings/templates`, `PATCH /settings/templates/:key`

- [x] **Step 1: Add templates methods to Settings Service**
  Modify `apps/api/src/settings/settings.service.ts`:
  ```ts
  import { messageTemplates } from "@cometkit/db";

  async getTemplates(tenantId: string) {
    return this.db.query.messageTemplates.findMany({
      where: eq(messageTemplates.tenantId, tenantId),
    });
  }

  async updateTemplate(tenantId: string, key: string, label: string, body: string) {
    const existing = await this.db.query.messageTemplates.findFirst({
      where: eq(messageTemplates.tenantId, tenantId) && eq(messageTemplates.key, key),
    });

    if (existing) {
      await this.db
        .update(messageTemplates)
        .set({ label, body, updatedAt: new Date() })
        .where(eq(messageTemplates.id, existing.id));
    } else {
      await this.db.insert(messageTemplates).values({
        id: ulid(),
        tenantId,
        key,
        label,
        body,
      });
    }

    return this.db.query.messageTemplates.findFirst({
      where: eq(messageTemplates.tenantId, tenantId) && eq(messageTemplates.key, key),
    });
  }
  ```

- [x] **Step 2: Create Templates Controller**
  Create `apps/api/src/settings/templates.controller.ts`:
  ```ts
  import { Body, Controller, Get, Param, Patch, UseGuards } from "@nestjs/common";
  import { JwtAuthGuard } from "../auth/jwt-auth.guard";
  import { RolesGuard } from "../auth/roles.guard";
  import { Roles } from "../auth/roles.decorator";
  import { SettingsService } from "./settings.service";
  import { TenantId } from "../tenancy/tenant-id.decorator";
  import { ZodValidationPipe } from "../common/zod-validation.pipe";
  import { templateInputSchema, type TemplateInput } from "@cometkit/shared";

  @Controller("settings/templates")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin")
  export class TemplatesController {
    constructor(private readonly settingsService: SettingsService) {}

    @Get()
    list(@TenantId() tenantId: string) {
      return this.settingsService.getTemplates(tenantId);
    }

    @Patch(":key")
    update(
      @TenantId() tenantId: string,
      @Param("key") key: string,
      @Body(new ZodValidationPipe(templateInputSchema)) input: TemplateInput,
    ) {
      return this.settingsService.updateTemplate(tenantId, key, input.label, input.body);
    }
  }
  ```

- [x] **Step 3: Register controller in module**
  Modify `apps/api/src/settings/settings.module.ts` to add `TemplatesController`.

- [x] **Step 4: Commit**
  ```bash
  git add apps/api/src/settings
  git commit -m "feat(tenant-settings): add message templates REST endpoints"
  ```

archived-with: 2026-07-05-tenant-settings
---

### Task 5: Web UI Admin Settings Management

**Files:**
- Create: `apps/web/src/hooks/use-settings.ts`
- Create: `apps/web/src/app/dashboard/settings/page.tsx`

**Interfaces:**
- Produces: `useSettings()`, `useUpdateSettings()`, visual settings editing forms.

- [x] **Step 1: Create TanStack Query hooks for Settings**
  Create `apps/web/src/hooks/use-settings.ts`:
  ```ts
  import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
  import type { SettingsInput } from "@cometkit/shared";
  import { api } from "@/lib/api";

  export const settingsKeys = {
    all: ["settings"] as const,
  };

  export function useSettings() {
    return useQuery({
      queryKey: settingsKeys.all,
      queryFn: () => api.get("settings").json<any>(),
    });
  }

  export function useUpdateSettings() {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: (input: SettingsInput) =>
        api.patch("settings", { json: input }).json<any>(),
      onSuccess: () => queryClient.invalidateQueries({ queryKey: settingsKeys.all }),
    });
  }
  ```

- [x] **Step 2: Create Settings page**
  Create `apps/web/src/app/dashboard/settings/page.tsx` with identity, integrations, and operations settings forms. Render a mobile-first, clean form validating WA numbers and inputs. Ensure admin navigation link is rendered conditionally in dashboard/page.tsx.

- [x] **Step 3: Commit**
  ```bash
  git add apps/web/src/hooks/use-settings.ts apps/web/src/app/dashboard/settings/page.tsx
  git commit -m "feat(tenant-settings): settings UI management panels"
  ```

archived-with: 2026-07-05-tenant-settings
---

### Task 6: Message Templates Editor UI

**Files:**
- Create: `apps/web/src/hooks/use-templates.ts`
- Create: `apps/web/src/app/dashboard/settings/templates/page.tsx`

**Interfaces:**
- Produces: `useTemplates()`, `useUpdateTemplate()`, templates editor.

- [x] **Step 1: Create Query hooks for Templates**
  Create `apps/web/src/hooks/use-templates.ts`:
  ```ts
  import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
  import type { TemplateInput } from "@cometkit/shared";
  import { api } from "@/lib/api";

  export const templateKeys = {
    all: ["templates"] as const,
  };

  export function useTemplates() {
    return useQuery({
      queryKey: templateKeys.all,
      queryFn: () => api.get("settings/templates").json<any[]>(),
    });
  }

  export function useUpdateTemplate() {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: ({ key, ...input }: TemplateInput & { key: string }) =>
        api.patch(`settings/templates/${key}`, { json: input }).json<any>(),
      onSuccess: () => queryClient.invalidateQueries({ queryKey: templateKeys.all }),
    });
  }
  ```

- [x] **Step 2: Create Templates page**
  Create `apps/web/src/app/dashboard/settings/templates/page.tsx`. Provide visual guidance on placeholder variables per template key, showing error alerts if unauthorized placeholders are saved.

- [x] **Step 3: Commit**
  ```bash
  git add apps/web/src/hooks/use-templates.ts apps/web/src/app/dashboard/settings/templates/page.tsx
  git commit -m "feat(tenant-settings): message templates editor UI with validation warnings"
  ```

archived-with: 2026-07-05-tenant-settings
---

### Task 7: Caching, Integration, and Verification

**Files:**
- Modify: `apps/api/src/settings/settings.service.ts`
- Modify: `apps/api/src/settings/settings.service.spec.ts`

**Interfaces:**
- Produces: Caching mechanism for threshold reads, comprehensive unit and integration test coverage.

- [x] **Step 1: Add cache in SettingsService**
  Implement caching inside `SettingsService` (60s memory TTL for `almostFullThreshold`).

- [x] **Step 2: Write tests**
  Create unit tests in `apps/api/src/settings/settings.service.spec.ts` to assert WA formatting, default values fallback, and templates validation. Write integration tests to check that the status engine respects settings updates.

- [x] **Step 3: Run verify**
  Run: `bun run verify`
  Run: `bun run test:int`
  Expected: All tests pass cleanly.

- [x] **Step 4: Commit**
  ```bash
  git add apps/api/src/settings
  git commit -m "test(tenant-settings): settings cache implementation and test coverage"
  ```
