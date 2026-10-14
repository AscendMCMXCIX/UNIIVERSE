import { boolean, index, integer, jsonb, pgTable, primaryKey, serial, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { actionTypeEnum, competitionModeEnum, draftStatusEnum, roleEnum, sideEnum, timestamps } from "./common";
import { teams } from "./team";
import { series } from "./series";
import { users } from "./auth";
import type { Role } from "@/domain/roles";

/** Optional enemy player names per role, entered by hand when known. Never required. */
export type EnemyPlayerNames = Partial<Record<Role, string>>;

/** Snapshot of a player at draft time so history stays accurate when pools change later. */
export interface LineupSnapshotPlayer {
  id: string;
  displayName: string;
  group: "main" | "other";
  primaryRole: Role;
  secondaryRole: Role | null;
  primaryPool: string[];
  secondaryPool: string[];
  /** Absent on drafts from before additional roles existed. */
  additionalRoles?: Array<{ role: Role; pool: string[] }>;
}

export const drafts = pgTable(
  "drafts",
  {
  id: uuid("id").primaryKey().defaultRandom(),
  teamId: uuid("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
  opponentName: text("opponent_name").notNull().default(""),
  side: sideEnum("side").notNull(),
  /** False while a new draft waits for its side to be chosen at the start of pick/ban (no action is accepted until then). */
  sideConfirmed: boolean("side_confirmed").notNull().default(true),
  patch: text("patch").notNull(),
  status: draftStatusEnum("status").notNull().default("in_progress"),
  /** Competition context and the draft format used (custom formats are embedded as a spec). */
  mode: competitionModeEnum("mode").notNull().default("tournament"),
  formatId: text("format_id").notNull().default("tournament"),
  formatSpec: jsonb("format_spec").$type<Record<string, unknown> | null>(),
  isTheorycraft: boolean("is_theorycraft").notNull().default(false),
  eventName: text("event_name").notNull().default(""),
  /** Legacy link to the retired opponent-scouting tables; kept nullable for old rows. */
  opponentTeamId: uuid("opponent_team_id"),
  /** Best-of series this game belongs to, and its 1-based game number within it. */
  seriesId: uuid("series_id").references(() => series.id, { onDelete: "set null" }),
  gameNumber: integer("game_number").notNull().default(1),
  enemyPlayers: jsonb("enemy_players").$type<EnemyPlayerNames>().notNull().default({}),
  /** Optimistic concurrency + realtime: bumped on every change. */
  version: integer("version").notNull().default(0),
  /** The account that created the draft: it controls picks and bans (admins may override). Null for drafts from before ownership; only admins control those. */
  createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
  /** Retired controller hand-off; superseded by createdByUserId (migration 0007). */
  controllerUserId: uuid("controller_user_id"),
  /** Coach/strategy soft preferences for this draft. */
  overrides: jsonb("overrides").$type<Record<string, unknown>>().notNull().default({}),
  lineupSnapshot: jsonb("lineup_snapshot").$type<LineupSnapshotPlayer[]>().notNull(),
  initialAssignments: jsonb("initial_assignments").$type<Record<Role, string>>().notNull(),
  currentAssignments: jsonb("current_assignments").$type<Record<Role, string>>().notNull(),
  unavailableChampionIds: jsonb("unavailable_champion_ids").$type<string[]>().notNull().default([]),
  finalAnalysis: jsonb("final_analysis").$type<Record<string, unknown> | null>(),
  notes: text("notes").notNull().default(""),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  ...timestamps,
},
  (t) => [index("drafts_team_created_idx").on(t.teamId, t.createdAt), index("drafts_created_by_idx").on(t.createdByUserId)],
);

export const draftActions = pgTable(
  "draft_actions",
  {
    id: serial("id").primaryKey(),
    draftId: uuid("draft_id").notNull().references(() => drafts.id, { onDelete: "cascade" }),
    sequenceIndex: integer("sequence_index").notNull(),
    type: actionTypeEnum("type").notNull(),
    side: sideEnum("side").notNull(),
    championId: text("champion_id"),
    playerId: uuid("player_id"),
    role: roleEnum("role"),
    /** What UNIIVERSE recommended at this moment (for later draft review). */
    recommendationSnapshot: jsonb("recommendation_snapshot").$type<Record<string, unknown> | null>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("draft_action_sequence_idx").on(t.draftId, t.sequenceIndex)],
);

export const draftRoleSwaps = pgTable("draft_role_swaps", {
  id: serial("id").primaryKey(),
  draftId: uuid("draft_id").notNull().references(() => drafts.id, { onDelete: "cascade" }),
  afterSequenceIndex: integer("after_sequence_index").notNull(),
  assignments: jsonb("assignments").$type<Record<Role, string>>().notNull(),
  reason: text("reason").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Who has the draft open right now (heartbeat from the live stream). */
export const draftPresence = pgTable(
  "draft_presence",
  {
    draftId: uuid("draft_id").notNull().references(() => drafts.id, { onDelete: "cascade" }),
    clientId: text("client_id").notNull(),
    userId: uuid("user_id"),
    label: text("label").notNull().default(""),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.draftId, t.clientId] })],
);

/** Per-champion evidence gathered for an enemy Riot ID entered on a draft (raw facts, no estimates). */
export interface EnemyChampionEvidence {
  championId: string;
  /** TOP | JUNGLE | MID | ADC | SUPPORT | UNKNOWN */
  role: string;
  games: number;
  wins: number;
  /** Games in the last 30 days. */
  recentGames: number;
  /** Games on the draft's current patch. */
  patchGames: number;
  lastPlayedAt: string | null;
  masteryPoints: number | null;
  masteryLevel: number | null;
}

/**
 * Session scouting: what Riot knows about the enemy Riot IDs entered for ONE draft. Nothing
 * here outlives the draft (it cascades with it); a Bo3's next game copies a fresh row rather
 * than building an opponent database. `status`: pending | ok | unresolved | failed.
 */
export const draftEnemyScouting = pgTable(
  "draft_enemy_scouting",
  {
    draftId: uuid("draft_id").notNull().references(() => drafts.id, { onDelete: "cascade" }),
    role: roleEnum("role").notNull(),
    riotId: text("riot_id").notNull(),
    platform: text("platform"),
    puuid: text("puuid"),
    status: text("status").notNull().default("pending"),
    error: text("error"),
    tier: text("tier"),
    division: text("division"),
    leaguePoints: integer("league_points"),
    rankedWins: integer("ranked_wins"),
    rankedLosses: integer("ranked_losses"),
    champions: jsonb("champions").$type<EnemyChampionEvidence[]>().notNull().default([]),
    gamesAnalysed: integer("games_analysed").notNull().default(0),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [primaryKey({ columns: [t.draftId, t.role] }), index("draft_enemy_scouting_puuid_idx").on(t.puuid, t.fetchedAt)],
);
