import { sql } from "drizzle-orm";
import { bigint, boolean, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { accountOwnerEnum, roleEnum, timestamps } from "./common";
import { players } from "./team";
import { opponentPlayers } from "./opponents";

/**
 * Riot accounts linked to our players (opponent rows are legacy). The PUUID is the canonical
 * identity (Riot IDs can change); it is unique so the same account is never counted twice.
 * Riot IDs are stored exactly as entered (full Unicode, no normalisation) and replaced by Riot's
 * own spelling once resolved. The platform is the player's selection until Riot's active-region
 * lookup confirms or corrects it (`platformSource` records which).
 *
 * `syncStatus`: never (not attempted yet) | ok | failed | unresolved (Riot ID not found).
 */
export const riotAccounts = pgTable(
  "riot_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerType: accountOwnerEnum("owner_type").notNull(),
    playerId: uuid("player_id").references(() => players.id, { onDelete: "cascade" }),
    opponentPlayerId: uuid("opponent_player_id").references(() => opponentPlayers.id, { onDelete: "cascade" }),
    gameName: text("game_name").notNull(),
    tagLine: text("tag_line").notNull(),
    platform: text("platform").notNull(),
    /** user = chosen in the region selector · riot = confirmed by Riot's active-region lookup */
    platformSource: text("platform_source").notNull().default("user"),
    puuid: text("puuid"),
    puuidResolvedAt: timestamp("puuid_resolved_at", { withTimezone: true }),
    /** Last time the Riot ID was re-read from Riot by PUUID (renames made outside UNIIVERSE are picked up automatically). */
    riotIdCheckedAt: timestamp("riot_id_checked_at", { withTimezone: true }),
    /** Failed resolution attempts since the last success (drives the Pending/Error wording). */
    resolveAttempts: integer("resolve_attempts").notNull().default(0),
    /** main | alt (one main per player) · demo for demo data */
    label: text("label").notNull().default("main"),
    role: roleEnum("role"),
    /** Visible rank snapshot (solo queue) for anomaly modelling. */
    tier: text("tier"),
    division: text("division"),
    leaguePoints: integer("league_points"),
    rankedWins: integer("ranked_wins"),
    rankedLosses: integer("ranked_losses"),
    rankUpdatedAt: timestamp("rank_updated_at", { withTimezone: true }),
    /** Which ranked queue the snapshot above is from: solo (Ranked Solo/Duo) or flex (Ranked Flex, only when there is no Solo/Duo rank). Null on snapshots taken before this was recorded. */
    rankQueue: text("rank_queue"),
    /** Incremental sync state. */
    syncCursor: bigint("sync_cursor", { mode: "number" }),
    lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
    syncStatus: text("sync_status").notNull().default("never"), // never | ok | failed | unresolved
    syncError: text("sync_error"),
    /** How far back this season's match history has been collected, per queue (see accounts/sync.ts). */
    historyBackfill: jsonb("history_backfill").$type<HistoryBackfill | null>(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("riot_accounts_puuid_idx").on(t.puuid),
    uniqueIndex("riot_accounts_riot_id_idx").on(t.platform, t.gameName, t.tagLine),
    index("riot_accounts_player_idx").on(t.playerId),
    index("riot_accounts_opponent_idx").on(t.opponentPlayerId),
    // One Main account per player (the others are Alts); every linked account still counts.
    uniqueIndex("riot_accounts_one_main_idx").on(t.playerId).where(sql`${t.label} = 'main' AND ${t.playerId} IS NOT NULL`),
  ],
);

/**
 * Season history collection state. Riot lists an account's match ids newest first; `offset` is
 * how many ids of that queue's season list have been read (and stored) so far, `done` is set once
 * the list ran out. New games push old ones to higher offsets, so an offset is always a safe
 * lower bound and nothing is ever skipped.
 */
export interface HistoryBackfill {
  /** Game-version major of the season being collected (16 = the 2026 season). */
  season: number;
  queues: Record<string, { offset: number; done: boolean; checkedAt?: string }>;
  startedAt: string;
  completedAt: string | null;
  /**
   * The season before, collected after the current one is complete (lowest priority, same
   * per-run budget), so the previous season can be shown with real numbers. Absent until begun.
   */
  previous?: { season: number; queues: Record<string, { offset: number; done: boolean; checkedAt?: string }>; completedAt: string | null } | null;
}

/** Per-account champion history, incrementally aggregated from the account's own matches. */
export const accountChampionHistory = pgTable(
  "account_champion_history",
  {
    accountId: uuid("account_id").notNull().references(() => riotAccounts.id, { onDelete: "cascade" }),
    championId: text("champion_id").notNull(),
    /** TOP | JUNGLE | MID | ADC | SUPPORT | UNKNOWN */
    role: text("role").notNull().default("UNKNOWN"),
    /** solo | flex | normal | other */
    queueGroup: text("queue_group").notNull().default("other"),
    patch: text("patch").notNull(),
    games: integer("games").notNull().default(0),
    wins: integer("wins").notNull().default(0),
    kills: integer("kills").notNull().default(0),
    deaths: integer("deaths").notNull().default(0),
    assists: integer("assists").notNull().default(0),
    lastPlayedAt: timestamp("last_played_at", { withTimezone: true }),
  },
  (t) => [primaryKey({ columns: [t.accountId, t.championId, t.role, t.queueGroup, t.patch] })],
);

/**
 * Match ids already folded into an account's history (so re-syncs never double count), plus
 * the few per-game facts the ranked journal can import without asking Riot again: the champion
 * played, the role, the queue, the result and the lane opponent. Rows synced before these
 * columns existed stay null and are simply not importable.
 */
export const accountMatches = pgTable(
  "account_matches",
  {
    accountId: uuid("account_id").notNull().references(() => riotAccounts.id, { onDelete: "cascade" }),
    matchId: text("match_id").notNull(),
    gameCreation: bigint("game_creation", { mode: "number" }).notNull(),
    queueId: integer("queue_id"),
    championId: text("champion_id"),
    /** TOP | JUNGLE | MID | ADC | SUPPORT | UNKNOWN */
    role: text("role"),
    win: boolean("win"),
    /** The enemy in the same position, when the match data exposes positions. */
    enemyChampionId: text("enemy_champion_id"),
    patch: text("patch"),
    gameDuration: integer("game_duration"),
    /** Per-game performance (null for games stored before these columns existed, until re-fetched). */
    kills: integer("kills"),
    deaths: integer("deaths"),
    assists: integer("assists"),
    /** Lane minions + neutral monsters killed. */
    cs: integer("cs"),
    /** Total damage dealt to champions. */
    damage: integer("damage"),
    visionScore: integer("vision_score"),
  },
  (t) => [primaryKey({ columns: [t.accountId, t.matchId] }), index("account_matches_recent_idx").on(t.accountId, t.gameCreation), index("account_matches_match_idx").on(t.matchId)],
);

export const accountMastery = pgTable(
  "account_mastery",
  {
    accountId: uuid("account_id").notNull().references(() => riotAccounts.id, { onDelete: "cascade" }),
    championId: text("champion_id").notNull(),
    points: integer("points").notNull().default(0),
    level: integer("level").notNull().default(0),
    lastPlayedAt: timestamp("last_played_at", { withTimezone: true }),
  },
  (t) => [primaryKey({ columns: [t.accountId, t.championId] })],
);

/**
 * One compact copy of a Riot match for the personal match history: both teams' players (champion,
 * KDA, CS, gold, damage, vision, items, spells, runes) and the team objectives. Stored once per
 * match however many linked accounts played it, from the match the account sync already fetched
 * (older games are filled in by the same sync, newest first). `participants[].puuid` stays on the
 * server; pages only learn which participant is the profile's player.
 */
export const matchDetails = pgTable("match_details", {
  matchId: text("match_id").primaryKey(),
  platform: text("platform"),
  queueId: integer("queue_id"),
  gameCreation: bigint("game_creation", { mode: "number" }).notNull(),
  gameDuration: integer("game_duration").notNull(),
  gameVersion: text("game_version"),
  teams: jsonb("teams").$type<MatchTeamDetail[]>().notNull(),
  participants: jsonb("participants").$type<MatchParticipantDetail[]>().notNull(),
  storedAt: timestamp("stored_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * What a match's timeline says about each player, kept once per match when a player first opens the
 * match: item purchases in order (undone purchases removed) and skill level-ups. An empty
 * participant list means Riot no longer provides the timeline.
 */
export const matchTimelines = pgTable("match_timelines", {
  matchId: text("match_id").primaryKey(),
  platform: text("platform"),
  participants: jsonb("participants").$type<MatchTimelineParticipant[]>().notNull(),
  storedAt: timestamp("stored_at", { withTimezone: true }).notNull().defaultNow(),
});

export interface MatchTimelineParticipant {
  puuid: string;
  /** Items bought, in order: [milliseconds into the game, item id]. */
  purchases: Array<[number, number]>;
  /** Skill slots levelled, in order (1 = Q, 2 = W, 3 = E, 4 = R). */
  skills: number[];
}

export interface MatchTeamDetail {
  teamId: number;
  win: boolean;
  bans: string[];
  /** Kills per objective as Riot reports them (baron, dragon, tower, inhibitor, riftHerald, horde, champion). */
  objectives: Record<string, number>;
}

export interface MatchParticipantDetail {
  puuid: string;
  /** "Name#TAG" when Riot sent it. */
  name: string | null;
  teamId: number;
  championId: string | null;
  championKey: number;
  champLevel: number | null;
  position: string | null;
  win: boolean;
  kills: number;
  deaths: number;
  assists: number;
  cs: number | null;
  gold: number | null;
  damage: number | null;
  damageTaken: number | null;
  vision: number | null;
  wardsPlaced: number | null;
  /** item0..item6 (0 = empty slot); null when Riot did not send them. */
  items: number[] | null;
  spells: number[] | null;
  /**
   * Keystone, primary and secondary rune paths; the full page (every rune chosen in each path) on
   * records stored from this phase on (older records have only the keystone and paths).
   */
  runes: { keystone: number | null; primary: number | null; secondary: number | null; primaryPerks?: number[]; secondaryPerks?: number[] } | null;
}
