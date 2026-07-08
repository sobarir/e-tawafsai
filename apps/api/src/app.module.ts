import { Module } from "@nestjs/common";
import { APP_FILTER } from "@nestjs/core";
import { ConfigModule } from "@nestjs/config";
import { LoggerModule } from "nestjs-pino";
import { ClsModule } from "nestjs-cls";
import { AllExceptionsFilter } from "./common/http-exception.filter";
import { validateEnv } from "./config/env";
import { DatabaseModule } from "./database/database.module";
import { TenancyModule } from "./tenancy/tenancy.module";
import { AuthModule } from "./auth/auth.module";
import { UsersModule } from "./users/users.module";
import { HealthModule } from "./health/health.module";
import { SettingsModule } from "./settings/settings.module";
import { ProvidersModule } from "./providers/providers.module";
import { PackagesModule } from "./packages/packages.module";
import { CategoriesModule } from "./categories/categories.module";
import { AirlinesModule } from "./airlines/airlines.module";
import { HotelsModule } from "./hotels/hotels.module";
import { DepartureCitiesModule } from "./departure-cities/departure-cities.module";
import { DeparturesModule } from "./departures/departures.module";
import { InclusionsModule } from "./inclusions/inclusions.module";
import { ExclusionsModule } from "./exclusions/exclusions.module";
import { SearchModule } from "./search/search.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
      // Root .env first (monorepo convention), local fallback second.
      envFilePath: ["../../.env", ".env"],
    }),
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.NODE_ENV === "production" ? "info" : "debug",
        transport:
          process.env.NODE_ENV === "production"
            ? undefined
            : { target: "pino-pretty", options: { singleLine: true } },
      },
    }),
    ClsModule.forRoot({
      global: true,
      // Establish a CLS context per request. The tenant id is populated later
      // by JwtStrategy (authenticated) or TenantResolutionMiddleware (public).
      middleware: { mount: true },
    }),
    DatabaseModule,
    TenancyModule,
    UsersModule,
    AuthModule,
    HealthModule,
    SettingsModule,
    ProvidersModule,
    PackagesModule,
    CategoriesModule,
    AirlinesModule,
    HotelsModule,
    DepartureCitiesModule,
    DeparturesModule,
    InclusionsModule,
    ExclusionsModule,
    SearchModule,
  ],
  providers: [{ provide: APP_FILTER, useClass: AllExceptionsFilter }],
})
export class AppModule {}

