import { bigint, index, integer, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
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
    /** Failed resolution attempts since the last success (drives the Pending/Error wording). */
    resolveAttempts: integer("resolve_attempts").notNull().default(0),
    /** main | alt | role */
    label: text("label").notNull().default("main"),
    role: roleEnum("role"),
    /** Visible rank snapshot (solo queue) for anomaly modelling. */
    tier: text("tier"),
    division: text("division"),
    leaguePoints: integer("league_points"),
    rankedWins: integer("ranked_wins"),
    rankedLosses: integer("ranked_losses"),
    rankUpdatedAt: timestamp("rank_updated_at", { withTimezone: true }),
    /** Incremental sync state. */
    syncCursor: bigint("sync_cursor", { mode: "number" }),
    lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
    syncStatus: text("sync_status").notNull().default("never"), // never | ok | failed | unresolved
    syncError: text("sync_error"),
    ...timestamps,
  },
  (t) => [uniqueIndex("riot_accounts_puuid_idx").on(t.puuid), uniqueIndex("riot_accounts_riot_id_idx").on(t.platform, t.gameName, t.tagLine), index("riot_accounts_player_idx").on(t.playerId), index("riot_accounts_opponent_idx").on(t.opponentPlayerId)],
);

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

/** Match ids already folded into an account's history (so re-syncs never double count). */
export const accountMatches = pgTable(
  "account_matches",
  {
    accountId: uuid("account_id").notNull().references(() => riotAccounts.id, { onDelete: "cascade" }),
    matchId: text("match_id").notNull(),
    gameCreation: bigint("game_creation", { mode: "number" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.accountId, t.matchId] })],
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
