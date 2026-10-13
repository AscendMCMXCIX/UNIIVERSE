import { index, integer, jsonb, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { refreshStatusEnum } from "./common";

/** One row per data pipeline / job. Feeds the Settings → Data health view and freshness labels. */
export const dataRefreshStatus = pgTable("data_refresh_status", {
  key: text("key").primaryKey(), // job name e.g. "static-sync", "ranked-ingest"
  status: refreshStatusEnum("status").notNull().default("never"),
  lastStartedAt: timestamp("last_started_at", { withTimezone: true }),
  lastSuccessAt: timestamp("last_success_at", { withTimezone: true }),
  lastFailureAt: timestamp("last_failure_at", { withTimezone: true }),
  lastError: text("last_error"),
  lastDurationMs: integer("last_duration_ms"),
  consecutiveFailures: integer("consecutive_failures").notNull().default(0),
  details: jsonb("details").$type<Record<string, unknown>>().notNull().default({}),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const jobRuns = pgTable(
  "job_runs",
  {
    id: serial("id").primaryKey(),
    job: text("job").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    ok: text("ok"), // "true" | "false" | null while running
    durationMs: integer("duration_ms"),
    summary: jsonb("summary").$type<Record<string, unknown>>().notNull().default({}),
    error: text("error"),
    trigger: text("trigger").notNull().default("manual"), // manual | tick | http | cli
  },
  (t) => [index("job_runs_started_idx").on(t.startedAt)],
);

/** Key/value application settings (engine weights, schedules, regions). */
export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").$type<unknown>().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
