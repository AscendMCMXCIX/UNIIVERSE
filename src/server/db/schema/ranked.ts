import { bigint, boolean, index, integer, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";

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

/** Work queue of match ids discovered but not yet fetched. Idempotent via primary key. */
export const matchFetchQueue = pgTable(
  "match_fetch_queue",
  {
    matchId: text("match_id").primaryKey(),
    platform: text("platform").notNull(),
    /** Ladder band of the tracked player whose match list surfaced the id (EMERALD … CHALLENGER). */
    tierBand: text("tier_band"),
    status: text("status").notNull().default("pending"), // pending | done | failed | skipped
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    discoveredAt: timestamp("discovered_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("queue_status_idx").on(t.status, t.discoveredAt)],
);

export const rankedMatches = pgTable(
  "ranked_matches",
  {
    matchId: text("match_id").primaryKey(),
    platform: text("platform").notNull(),
    gameVersion: text("game_version").notNull(),
    patch: text("patch").notNull(),
    queueId: integer("queue_id").notNull(),
    /** Ladder band the match was sampled from (null for matches stored before bands existed = Master+). */
    tierBand: text("tier_band"),
    gameCreation: bigint("game_creation", { mode: "number" }).notNull(),
    gameDuration: integer("game_duration").notNull(),
    winningTeamId: integer("winning_team_id").notNull(),
    ingestedAt: timestamp("ingested_at", { withTimezone: true }).notNull().defaultNow(),
    /** Set once the aggregation job has folded this match into the statistics tables. */
    aggregatedAt: timestamp("aggregated_at", { withTimezone: true }),
  },
  (t) => [index("ranked_matches_patch_idx").on(t.patch), index("ranked_matches_aggregated_idx").on(t.aggregatedAt), index("ranked_matches_platform_patch_idx").on(t.platform, t.patch)],
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

export const rankedParticipants = pgTable(
  "ranked_participants",
  {
    matchId: text("match_id").notNull().references(() => rankedMatches.matchId, { onDelete: "cascade" }),
    puuid: text("puuid").notNull(),
    teamId: integer("team_id").notNull(),
    championKey: integer("champion_key").notNull(),
    championId: text("champion_id"), // resolved from champions.key at ingestion when known
    position: text("position").notNull(), // TOP | JUNGLE | MIDDLE | BOTTOM | UTILITY | UNKNOWN
    win: boolean("win").notNull(),
    kills: integer("kills").notNull().default(0),
    deaths: integer("deaths").notNull().default(0),
    assists: integer("assists").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.matchId, t.puuid] }), index("participants_champion_idx").on(t.championKey)],
);

export const rankedBans = pgTable(
  "ranked_bans",
  {
    matchId: text("match_id").notNull().references(() => rankedMatches.matchId, { onDelete: "cascade" }),
    teamId: integer("team_id").notNull(),
    pickTurn: integer("pick_turn").notNull(),
    championKey: integer("champion_key").notNull(),
  },
  (t) => [primaryKey({ columns: [t.matchId, t.teamId, t.pickTurn] })],
);
