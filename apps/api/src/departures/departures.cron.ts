import { Injectable, OnModuleInit, OnModuleDestroy, Inject } from "@nestjs/common";
import { and, lte, notInArray } from "drizzle-orm";
import { departures, type Database } from "@cometkit/db";
import { DB } from "../database/database.module";

@Injectable()
export class DeparturesCron implements OnModuleInit, OnModuleDestroy {
  private timer: NodeJS.Timeout | null = null;

  constructor(@Inject(DB) private readonly db: Database) {}

  onModuleInit() {
    // Run check every hour in dev mode
    this.timer = setInterval(() => this.runCron(), 3600 * 1000);
    // Also run once immediately on startup
    void this.runCron();
  }

  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }

  async runCron() {
    const now = new Date();
    try {
      await this.db
        .update(departures)
        .set({ status: "departed" })
        .where(
          and(
            lte(departures.departureDate, now),
            notInArray(departures.status, ["departed", "cancelled"])
          )
        );
    } catch {
      // Silently log or ignore on startup
    }
  }
}
