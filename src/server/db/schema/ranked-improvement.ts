import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { roleEnum, timestamps } from "./common";
import { players } from "./team";
import { riotAccounts } from "./accounts";

/*
  Ranked Improvement: a private Solo/Duo journal per player profile. Every row belongs to one
  player (the owner); nothing here is read by the draft engine, proficiency or team pages, and
  every query goes through the owner check in src/server/ranked/repository.ts.
*/

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
    /** Why a completed block ended: "manual" or "two-losses"; null for blocks finished before this was kept (manual). */
    completedReason: text("completed_reason"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [uniqueIndex("ranked_blocks_player_number_idx").on(t.playerId, t.number), index("ranked_blocks_player_status_idx").on(t.playerId, t.status)],
);

/** One ranked game: a handful of facts, the main mistake and a note. `result`: win | loss. */
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
    ...timestamps,
  },
  (t) => [
    index("ranked_games_block_idx").on(t.blockId),
    index("ranked_games_player_played_idx").on(t.playerId, t.playedAt),
    index("ranked_games_teammate_idx").on(t.teammatePlayerId),
    uniqueIndex("ranked_games_player_match_idx").on(t.playerId, t.riotMatchId),
  ],
);
