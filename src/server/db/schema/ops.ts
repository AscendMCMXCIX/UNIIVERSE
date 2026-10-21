import { bigint, boolean, date, index, integer, jsonb, pgTable, primaryKey, serial, smallint, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { bytea, refreshStatusEnum } from "./common";

/** One row per data pipeline / job. Feeds the Settings → Data health view and freshness labels. */
export const dataRefreshStatus = pgTable("data_refresh_status", {
  key: text("key").primaryKey(), // job name e.g. "static-sync", "account-sync"
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

/**
 * Branding images (logo, background), each optionally with a still first frame for animated GIFs
 * (favicons, reduced motion, the in-app backdrop). Served from /api/branding/<kind>.
 */
export const brandAssets = pgTable("brand_assets", {
  kind: text("kind").primaryKey(), // "logo" | "logo-static" | "background" | "background-static"
  contentType: text("content_type").notNull(),
  data: bytea("data").notNull(),
  width: integer("width"),
  height: integer("height"),
  animated: boolean("animated").notNull().default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Pieces of a branding image being uploaded. The hosting platform caps one request at 4.5 MB, so
 * images up to 20 MB arrive in pieces and are assembled, checked and moved into brand_assets by
 * the finishing step, which also deletes them. Pieces of abandoned uploads are pruned after an hour.
 */
export const brandUploadChunks = pgTable(
  "brand_upload_chunks",
  {
    uploadId: uuid("upload_id").notNull(),
    kind: text("kind").notNull(),
    idx: integer("idx").notNull(),
    data: bytea("data").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.uploadId, t.idx] })],
);

/** Key/value application settings (engine weights, schedules, regions). */
export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").$type<unknown>().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Who changed accounts, access, passwords, branding or data settings, and when (Admin → System
 * Health → Admin activity). Append-only: the app never updates or deletes a row. No foreign keys,
 * so the record outlives a deleted account; names are kept as they were at the time. Never holds a
 * password, token or other secret (server/audit/log.ts keeps details to short labels).
 */
export const auditEvents = pgTable(
  "audit_events",
  {
    id: serial("id").primaryKey(),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
    actorUserId: uuid("actor_user_id"),
    actorName: text("actor_name"),
    action: text("action").notNull(),
    targetType: text("target_type"),
    targetId: text("target_id"),
    targetName: text("target_name"),
    details: jsonb("details").$type<Record<string, string | number | boolean | null>>().notNull().default({}),
  },
  (t) => [index("audit_events_at_idx").on(t.at)],
);

/**
 * Estimated database egress (bytes the database sent to the app) per query shape and UTC day,
 * counted by every server instance and written every few minutes (server/db/egress.ts); kept 35
 * days. A shape is the SQL text with its literals replaced, as pg_stat_statements shows it: no
 * value from any table is stored here.
 */
export const dbEgressDaily = pgTable(
  "db_egress_daily",
  {
    day: date("day", { mode: "string" }).notNull(),
    label: text("label").notNull(),
    sample: text("sample").notNull(),
    calls: bigint("calls", { mode: "number" }).notNull().default(0),
    rows: bigint("rows", { mode: "number" }).notNull().default(0),
    bytes: bigint("bytes", { mode: "number" }).notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.day, t.label] })],
);

/**
 * Field performance (domain/web-vitals): how many page loads fell in each bucket of each metric,
 * per UTC day, page group and device class. Counts only: nothing here identifies a person, an
 * account or an address. Written by /api/vitals (server/observability/web-vitals), kept 35 days.
 */
export const webVitalsDaily = pgTable(
  "web_vitals_daily",
  {
    day: date("day", { mode: "string" }).notNull(),
    metric: text("metric").notNull(),
    page: text("page").notNull(),
    device: text("device").notNull(),
    bucket: smallint("bucket").notNull(),
    count: integer("count").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.day, t.metric, t.page, t.device, t.bucket] })],
);
