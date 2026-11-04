import { boolean, index, integer, jsonb, pgTable, smallint, text, timestamp, uniqueIndex, uuid, type AnyPgColumn } from "drizzle-orm/pg-core";
import { roleEnum, timestamps } from "./common";
import { players } from "./team";
import { riotAccounts } from "./accounts";
import { developmentObjectives, developmentPlans } from "./development";

/*
  Retired with Ranked Development (docs/RANKED_DEVELOPMENT.md): its sessions (formerly Solo Queue
  Blocks, and the Ranked Improvement journal before them), their games and each player's ranked
  focus. Nothing reads these tables or writes to them any more; their rows are kept until a
  separate, approval-gated clean-up deletes them. They stay defined so drizzle-kit never generates
  a DROP. Every row belongs to one player and goes with the player when their profile is deleted
  (foreign keys cascade) or their personal information is removed (server/privacy/erasure.ts). A
  session is a ranked_blocks row, its games ranked_games.
*/

/** The rank a session started at, read from the account's stored rank (no Riot request). */
export interface SessionStartRank {
  accountId: string;
  tier: string | null;
  division: string | null;
  leaguePoints: number | null;
  /** The season's Solo/Duo wins and losses at that reading (they bracket the session's games). */
  wins?: number | null;
  losses?: number | null;
  /** When that rank was last read from Riot. */
  at: string | null;
}

/** Personal ranked focus: three champions, a counter pick and one sentence of improvement focus. */
export const rankedProfiles = pgTable("ranked_profiles", {
  playerId: uuid("player_id").primaryKey().references(() => players.id, { onDelete: "cascade" }),
  champion1: text("champion_1"),
  champion2: text("champion_2"),
  champion3: text("champion_3"),
  counterPick: text("counter_pick"),
  focus: text("focus").notNull().default(""),
  /**
   * Retired (Patterns & Notes was removed): nothing reads or writes this column any more. It stays
   * in the schema so no migration drops what players may have typed; remove it only after checking
   * production holds no notes.
   */
  notes: text("notes").notNull().default(""),
  ...timestamps,
});

/**
 * A block of ranked games. `status`: active | completed; one active block per player. A block
 * counts the games logged (0 Games, then 1, 2 …; no implied limit); `plannedGames` is an
 * optional target the player may set, never a limit.
 */
export const rankedBlocks = pgTable(
  "ranked_blocks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    playerId: uuid("player_id").notNull().references(() => players.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    status: text("status").notNull().default("active"),
    /** Games the player chose for this block when starting it (blocks before this choice existed: 6). */
    plannedGames: integer("planned_games"),
    /** The ranked focus while this block was played (kept when the focus changes later). */
    focus: text("focus"),
    /** The featured champion of the ranked focus while this block was played (kept the same way). */
    featuredChampionId: text("featured_champion_id"),
    /** How the block ends: "target" (finished by the player; an optional game target is a plan) or "two-losses" (ends on its 2nd loss). */
    completionRule: text("completion_rule").notNull().default("target"),
    /**
     * Why a completed session ended: "manual", "two-losses", or "idle" (no game for twelve hours:
     * ended at its last activity); null for blocks finished before this was kept (manual).
     */
    completedReason: text("completed_reason"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    /** The development objective practised in this session (kept when the objective changes later). */
    objectiveId: uuid("objective_id").references((): AnyPgColumn => developmentObjectives.id, { onDelete: "set null" }),
    /** The If–Then plan played with (plans are versioned, so this is the exact wording). */
    planId: uuid("plan_id").references((): AnyPgColumn => developmentPlans.id, { onDelete: "set null" }),
    /** The linked account the session follows; null for any of the player's accounts. */
    accountId: uuid("account_id").references(() => riotAccounts.id, { onDelete: "set null" }),
    /** The start, the latest game's end or the player's latest action: a session idle for twelve hours ends. */
    lastActivityAt: timestamp("last_activity_at", { withTimezone: true }),
    /**
     * Synced games that ended after this moment join the session by themselves (its start; for a
     * block already in progress when sessions arrived, that moment, so games the player chose not to
     * import are never added). Null for blocks finished before then: nothing joins them.
     */
    collectsFrom: timestamp("collects_from", { withTimezone: true }),
    startRank: jsonb("start_rank").$type<SessionStartRank>(),
    /** The player's own closing note on the session. */
    closingNote: text("closing_note").notNull().default(""),
    /** Synced matches the player removed from this session: they never join a session by themselves again. */
    dismissedMatchIds: jsonb("dismissed_match_ids").$type<string[]>().notNull().default([]),
    ...timestamps,
  },
  (t) => [uniqueIndex("ranked_blocks_player_number_idx").on(t.playerId, t.number), index("ranked_blocks_player_status_idx").on(t.playerId, t.status)],
);

/**
 * One ranked game in a session: its facts (from the synced match, or typed by hand), and the
 * player's review of it. `result`: win | loss. One row per Riot match per player, so a game can
 * never be in two sessions or reviewed twice. Deleting the row (or its session) never touches the
 * synced match itself.
 */
export const rankedGames = pgTable(
  "ranked_games",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    blockId: uuid("block_id").notNull().references(() => rankedBlocks.id, { onDelete: "cascade" }),
    playerId: uuid("player_id").notNull().references(() => players.id, { onDelete: "cascade" }),
    /** Which linked Riot account the game was played on (null when unknown or the account was unlinked). */
    accountId: uuid("account_id").references(() => riotAccounts.id, { onDelete: "set null" }),
    /** Riot match id when imported from synced match data; unique per player so a game is never journaled twice. */
    riotMatchId: text("riot_match_id"),
    playedAt: timestamp("played_at", { withTimezone: true }).notNull().defaultNow(),
    role: roleEnum("role"),
    championId: text("champion_id").notNull(),
    enemyChampionId: text("enemy_champion_id"),
    result: text("result").notNull(),
    /** One of the MAIN_MISTAKES keys, or null. */
    mainMistake: text("main_mistake"),
    notes: text("notes").notNull().default(""),
    link: text("link").notNull().default(""),
    /** Teammate from this team the game was played with (duo); never grants them access. */
    teammatePlayerId: uuid("teammate_player_id").references(() => players.id, { onDelete: "set null" }),
    /** Registered teammates detected in the same match whom the owner marked as not played with. */
    notPlayedWith: jsonb("not_played_with").$type<string[]>().notNull().default([]),
    /** "auto" (joined its session when synced), "import" (added from synced games) or "manual" (typed in). */
    source: text("source").notNull().default("manual"),
    /** The objective the game was played for (the session's at the time). */
    objectiveId: uuid("objective_id").references((): AnyPgColumn => developmentObjectives.id, { onDelete: "set null" }),
    /** none | pending | done | skipped. */
    reviewStatus: text("review_status").notNull().default("none"),
    /** How consistently the plan was followed, 0 (not at all) to 3 (every time); self-reported. */
    execution: smallint("execution"),
    /** Areas the player named as best and hardest. */
    wentWell: text("went_well"),
    wentWrong: text("went_wrong"),
    learning: text("learning").notNull().default(""),
    adjustment: text("adjustment").notNull().default(""),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    /**
     * The game fits two sessions (it was being played when one ended and the next began): it was
     * put in the earlier one and the player is asked once to keep it there or move it.
     */
    needsConfirmation: boolean("needs_confirmation").notNull().default(false),
    alternativeBlockId: uuid("alternative_block_id").references((): AnyPgColumn => rankedBlocks.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    index("ranked_games_block_idx").on(t.blockId),
    index("ranked_games_player_played_idx").on(t.playerId, t.playedAt),
    index("ranked_games_teammate_idx").on(t.teammatePlayerId),
    uniqueIndex("ranked_games_player_match_idx").on(t.playerId, t.riotMatchId),
    index("ranked_games_objective_idx").on(t.playerId, t.objectiveId),
  ],
);
