import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { competitionModeEnum, matchResultEnum, sideEnum, timestamps } from "./common";
import { players, teams } from "./team";
import { users } from "./auth";
import { drafts, type EnemyPlayerNames, type LineupSnapshotPlayer } from "./drafts";
import { opponentTeams } from "./opponents";
import { series } from "./series";
import type { Role } from "@/domain/roles";

/**
 * Archived match records. Created automatically when a (non-theorycraft) draft completes and
 * never used to train the engine: they exist so the team can look back.
 */
export const matches = pgTable(
  "matches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    teamId: uuid("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
    draftId: uuid("draft_id").references(() => drafts.id, { onDelete: "set null" }),
    mode: competitionModeEnum("mode").notNull().default("other"),
    eventName: text("event_name").notNull().default(""),
    patch: text("patch").notNull(),
    side: sideEnum("side").notNull(),
    lineupSnapshot: jsonb("lineup_snapshot").$type<LineupSnapshotPlayer[]>().notNull(),
    finalAssignments: jsonb("final_assignments").$type<Record<Role, string>>().notNull(),
    ourBans: jsonb("our_bans").$type<Array<string | null>>().notNull().default([]),
    enemyBans: jsonb("enemy_bans").$type<Array<string | null>>().notNull().default([]),
    ourPicks: jsonb("our_picks").$type<Array<{ playerId: string | null; role: Role | null; championId: string; index: number }>>().notNull().default([]),
    enemyPicks: jsonb("enemy_picks").$type<Array<{ championId: string; index: number }>>().notNull().default([]),
    /** Legacy link to the retired opponent-scouting tables; kept nullable for old rows. */
    opponentTeamId: uuid("opponent_team_id").references(() => opponentTeams.id, { onDelete: "set null" }),
    opponentName: text("opponent_name").notNull().default(""),
    seriesId: uuid("series_id").references(() => series.id, { onDelete: "set null" }),
    gameNumber: integer("game_number").notNull().default(1),
    /** Optional enemy player names by role, as entered before or after the game. */
    enemyPlayers: jsonb("enemy_players").$type<EnemyPlayerNames>().notNull().default({}),
    playbook: jsonb("playbook").$type<Record<string, unknown> | null>(),
    result: matchResultEnum("result"),
    durationSeconds: integer("duration_seconds"),
    riotMatchId: text("riot_match_id"),
    riotInfo: jsonb("riot_info").$type<Record<string, unknown> | null>(),
    /** Riot match ids a person said are not this match: never suggested for it again. */
    dismissedRiotMatchIds: jsonb("dismissed_riot_match_ids").$type<string[]>().notNull().default([]),
    notes: text("notes").notNull().default(""),
    vodUrl: text("vod_url").notNull().default(""),
    playedAt: timestamp("played_at", { withTimezone: true }).notNull().defaultNow(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index("matches_team_played_idx").on(t.teamId, t.playedAt), index("matches_opponent_idx").on(t.opponentTeamId), index("matches_series_idx").on(t.seriesId)],
);

/**
 * Riot games the team wants to find again (Matches → Bookmarked). A game played together is
 * bookmarked by any member who can see it; a member's own game that no teammate played is only
 * here because that member shared it (playerId), and only they or a match manager remove it.
 */
export const teamBookmarks = pgTable(
  "team_bookmarks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    teamId: uuid("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
    riotMatchId: text("riot_match_id").notNull(),
    /** Set when a member shared one of their own games; null for a game played together. */
    playerId: uuid("player_id").references(() => players.id, { onDelete: "cascade" }),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    note: text("note").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("team_bookmarks_team_match_idx").on(t.teamId, t.riotMatchId)],
);
