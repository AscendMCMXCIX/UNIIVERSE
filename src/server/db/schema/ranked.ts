import { bigint, index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

// What is left of the global ranked collection behind Meta & Trends (retired; migration 0047
// dropped the collected games and their queue). Nothing writes these tables any more; Match
// History still reads tracked_summoners as a rank fallback for other players, so its rows stay as
// they were last refreshed. They stay defined so drizzle-kit never generates a DROP
// (docs/DATA_PIPELINES.md, "Retired tables").

/** High-Elo players discovered from the league endpoints; the seed list for match discovery. */
export const trackedSummoners = pgTable(
  "tracked_summoners",
  {
    puuid: text("puuid").primaryKey(),
    platform: text("platform").notNull(), // euw1, kr, na1 ...
    tier: text("tier").notNull(), // CHALLENGER | GRANDMASTER | MASTER | DIAMOND | EMERALD
    leaguePoints: integer("league_points").notNull().default(0),
    lastSeenInLeagueAt: timestamp("last_seen_in_league_at", { withTimezone: true }).notNull().defaultNow(),
    lastMatchListAt: timestamp("last_match_list_at", { withTimezone: true }),
    /** Epoch seconds of the newest match discovered for this player; next fetch starts here. */
    matchListCursor: bigint("match_list_cursor", { mode: "number" }),
  },
  (t) => [index("tracked_platform_idx").on(t.platform, t.lastMatchListAt)],
);

/**
 * Per-platform ingestion state: when each region was last refreshed, scanned and ingested, and
 * the last error it produced. Feeds the Global Data Coverage table; counts come from the match
 * tables themselves.
 */
export const regionStatus = pgTable("region_status", {
  platform: text("platform").primaryKey(),
  /** Last league-list refresh (discovery step 1). */
  lastLeagueRefreshAt: timestamp("last_league_refresh_at", { withTimezone: true }),
  /** Last match-list scan for players of this platform (discovery step 2). */
  lastDiscoverAt: timestamp("last_discover_at", { withTimezone: true }),
  /** Last match fetched and stored for this platform. */
  lastIngestAt: timestamp("last_ingest_at", { withTimezone: true }),
  lastError: text("last_error"),
  lastErrorAt: timestamp("last_error_at", { withTimezone: true }),
  consecutiveErrors: integer("consecutive_errors").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

