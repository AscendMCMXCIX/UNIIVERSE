import { integer, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";
import { statSourceEnum } from "./common";

// Retired with Meta & Trends: nothing reads or writes these tables any more. Migration 0047 dropped
// the champion statistics; these period tables stay defined (so drizzle-kit never generates a
// DROP) until the owner decides on them (docs/DATA_PIPELINES.md, "Retired tables").

/**
 * Aggregated statistics are keyed by patch and source and are never overwritten when a new
 * patch arrives: a new patch simply starts a new period.
 */
export const statPeriods = pgTable(
  "stat_periods",
  {
    patch: text("patch").notNull(),
    source: statSourceEnum("source").notNull(),
    games: integer("games").notNull().default(0),
    firstGameAt: timestamp("first_game_at", { withTimezone: true }),
    lastGameAt: timestamp("last_game_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.patch, t.source] })],
);

/**
 * Provenance of the aggregated games per region: how many games each platform contributed to a
 * (patch, source) period, from which queue and ladder population, and how fresh they are. Lets
 * the UI say which regions stand behind a number without touching raw matches.
 */
export const statRegionPeriods = pgTable(
  "stat_region_periods",
  {
    patch: text("patch").notNull(),
    source: statSourceEnum("source").notNull(),
    /** Riot platform id, or "pro" for professional games (no server). */
    platform: text("platform").notNull(),
    /** Riot queue id (420 = ranked solo) or 0 when not applicable. */
    queueId: integer("queue_id").notNull().default(420),
    /** Ladder population the games were sampled from, e.g. "MASTER+" or "PRO". */
    tierPopulation: text("tier_population").notNull().default("MASTER+"),
    games: integer("games").notNull().default(0),
    firstGameAt: timestamp("first_game_at", { withTimezone: true }),
    lastGameAt: timestamp("last_game_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.patch, t.source, t.platform] })],
);

/**
 * Provenance of the ranked sample per ladder band: how many games each band (EMERALD, DIAMOND,
 * MASTER, GRANDMASTER, CHALLENGER; "MASTER+" for matches stored before bands were recorded)
 * contributed to a (patch, source) period. Lets Data health say which populations are covered.
 */
export const statRankPeriods = pgTable(
  "stat_rank_periods",
  {
    patch: text("patch").notNull(),
    source: statSourceEnum("source").notNull(),
    tierBand: text("tier_band").notNull(),
    games: integer("games").notNull().default(0),
    firstGameAt: timestamp("first_game_at", { withTimezone: true }),
    lastGameAt: timestamp("last_game_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.patch, t.source, t.tierBand] })],
);
