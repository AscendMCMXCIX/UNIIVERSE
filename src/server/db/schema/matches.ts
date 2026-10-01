import { index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { competitionModeEnum, matchResultEnum, sideEnum, timestamps } from "./common";
import { teams } from "./team";
import { drafts, type LineupSnapshotPlayer } from "./drafts";
import { opponentTeams } from "./opponents";
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
    opponentTeamId: uuid("opponent_team_id").references(() => opponentTeams.id, { onDelete: "set null" }),
    opponentName: text("opponent_name").notNull().default(""),
    playbook: jsonb("playbook").$type<Record<string, unknown> | null>(),
    result: matchResultEnum("result"),
    durationSeconds: integer("duration_seconds"),
    riotMatchId: text("riot_match_id"),
    riotInfo: jsonb("riot_info").$type<Record<string, unknown> | null>(),
    notes: text("notes").notNull().default(""),
    vodUrl: text("vod_url").notNull().default(""),
    playedAt: timestamp("played_at", { withTimezone: true }).notNull().defaultNow(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index("matches_team_played_idx").on(t.teamId, t.playedAt), index("matches_opponent_idx").on(t.opponentTeamId)],
);
