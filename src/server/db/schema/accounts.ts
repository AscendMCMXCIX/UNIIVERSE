import { sql } from "drizzle-orm";
import { bigint, boolean, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { accountOwnerEnum, roleEnum, timestamps } from "./common";
import { players } from "./team";
import type { ObjectiveKind } from "@/domain/match-events";

/**
 * Riot accounts linked to our players (the `opponent` owner type is legacy: none are left). The PUUID is the canonical
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
    /** The player's chosen position among their accounts (the Main is always first); null until reordered. Presentation only. */
    sortOrder: integer("sort_order"),
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
  /**
   * Per queue. `rescan`: a run stopped partway down the newest page, so games below the ones it
   * stored may have been pushed past the offset by new games; once a later run completes the
   * newest page, the older pages are read again from there (the queue stays finished until then).
   */
  queues: Record<string, { offset: number; done: boolean; checkedAt?: string; rescan?: boolean }>;
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
 * the few per-game facts read without asking Riot again (Match History, Played Together, possible
 * groups): the champion played, the role, the queue, the result and the lane opponent. Rows synced
 * before these columns existed stay null.
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
    /*
      This player's figures from the stored match details, copied once when the details are
      stored (Team Leaderboards and Played Together read these columns instead of re-reading
      every match's JSON). Null until summarised; `summarisedAt` is set even when the details
      have no entry for this player (an unavailable match), so nothing is read twice.
    */
    /** 100 (blue side) or 200 (red side). */
    teamId: integer("team_id"),
    gold: integer("gold"),
    wardsPlaced: integer("wards_placed"),
    /** The kills of this player's team (kill participation). */
    teamKills: integer("team_kills"),
    /** The champion damage of this player's team; null when any teammate's damage is missing. */
    teamDamage: bigint("team_damage", { mode: "number" }),
    /** The extra figures kept from Phase 14 on (multikills, wards cleared, objectives…). */
    extraStats: jsonb("extra_stats").$type<ParticipantExtraStats>(),
    summarisedAt: timestamp("summarised_at", { withTimezone: true }),
  },
  (t) => [
    primaryKey({ columns: [t.accountId, t.matchId] }),
    index("account_matches_recent_idx").on(t.accountId, t.gameCreation),
    index("account_matches_match_idx").on(t.matchId),
    // The few rows still waiting for their summary (normally none): found without a scan.
    index("account_matches_unsummarised_idx").on(t.accountId).where(sql`${t.summarisedAt} IS NULL AND ${t.championId} IS NOT NULL`),
  ],
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
 * The last rank known for players outside the team, one row per player, shown beside a match's
 * players in the match window with its date (server/players/participant-ranks.ts):
 * - "match lookup": Riot's LEAGUE-V4 entries, read when a member opened a match the player was in
 *   and the stored reading was missing or older than three days. Both ranked queues are written;
 *   "UNRANKED" means Riot listed no entry in that queue then.
 * - "draft scouting" | "ranked ladder": what migration 0048 copied from two retired sources (the
 *   Draft's enemy scouting and the Meta & Trends ranked ladder); the Solo/Duo tier only, until
 *   a lookup replaces the row.
 * The team's own accounts carry their current rank on riot_accounts and rank_snapshots instead.
 */
export const lastKnownRanks = pgTable(
  "last_known_ranks",
  {
    puuid: text("puuid").primaryKey(),
    /** Ranked Solo/Duo. */
    tier: text("tier").notNull(),
    /** Null for the ladder's sightings (they had no division), apex tiers and UNRANKED. */
    division: text("division"),
    leaguePoints: integer("league_points"),
    /** Ranked Flex: written by lookups only (null on the older sightings, which never read it). */
    flexTier: text("flex_tier"),
    flexDivision: text("flex_division"),
    flexLeaguePoints: integer("flex_league_points"),
    /** When it was read (a lookup: when Riot was asked). */
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
    /** "match lookup" | "draft scouting" | "ranked ladder" */
    source: text("source").notNull(),
  },
  (t) => [index("last_known_ranks_lookups_idx").on(t.observedAt).where(sql`${t.source} = 'match lookup'`)],
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
}, (t) => [
  // The players' PUUIDs alone, so the games one player appears in are found without reading every
  // record (possible groups, the newest Riot ID for an OP.GG link). Queries use the same expression.
  // fastupdate off: records arrive a few an hour, so each goes straight into the index instead of a
  // pending list that every search would scan (and that can make Postgres skip the index).
  index("match_details_puuids_idx").using("gin", sql`(jsonb_path_query_array(${t.participants}, '$[*].puuid'))`).with({ fastupdate: false }),
  // The players' champions alone, so Champion Intel's builds (server/champion-builds) open only the
  // records of one champion instead of every record. The statement uses the same expression.
  index("match_details_champions_idx").using("gin", sql`(jsonb_path_query_array(${t.participants}, '$[*].championId'))`).with({ fastupdate: false }),
]);

/**
 * What a match's timeline says about each player, kept once per match when a player first opens the
 * match or the timeline backfill reaches it: item purchases in order (undone purchases removed),
 * skill level-ups and, from the Matchups release on, gold, experience and CS at each frame; from
 * Match History 2.0 on, when each player took part in a champion kill, and the objectives each team
 * took. An empty participant list means Riot no longer provides the timeline.
 */
export const matchTimelines = pgTable("match_timelines", {
  matchId: text("match_id").primaryKey(),
  platform: text("platform"),
  participants: jsonb("participants").$type<MatchTimelineParticipant[]>().notNull(),
  /** Null on rows stored before frames were kept (build order only): the backfill refetches those. */
  frames: jsonb("frames").$type<MatchFrames>(),
  /**
   * The objectives and buildings each team took (team facts, no player), and the sign that the
   * participants carry their kill times. Null on rows stored before (29 Oct 2026): such a timeline
   * is fetched again, once, the next time someone opens its Timeline.
   */
  events: jsonb("events").$type<MatchEvents>(),
  storedAt: timestamp("stored_at", { withTimezone: true }).notNull().defaultNow(),
});

/** An objective or building a team took, at milliseconds into the game. */
export interface MatchObjectiveEvent {
  t: number;
  /** The team that took it: 100 (blue side) or 200 (red side). */
  team: number;
  kind: ObjectiveKind;
  /** A dragon's element (FIRE, EARTH, WATER, AIR, HEXTECH, CHEMTECH); a building's lane (TOP, MID, BOT) and a tower's tier (OUTER, INNER, BASE, NEXUS). */
  detail?: string;
}

export interface MatchEvents {
  objectives: MatchObjectiveEvent[];
  /**
   * The turret plates each team took, in order (team facts, like the objectives): kept from 20 Nov
   * 2026 on, and always present on timelines kept since, so an absent list marks an older timeline.
   */
  plates?: MatchPlateEvent[];
  /** Riot no longer provides the timeline: the events were asked for and are not available. */
  missing?: true;
}

/** A turret plate taken: when, by which team (Riot names the side that lost it) and on which lane. */
export interface MatchPlateEvent {
  t: number;
  team: number;
  /** TOP, MID or BOT. */
  lane: string;
}

/**
 * Per-player figures at each timeline frame. Riot's frames are about a minute apart but not exactly:
 * `t` holds every frame's own timestamp (ms into the game), and each player's arrays are aligned
 * with it. `g` total gold earned, `x` experience, `c` lane minions + jungle monsters killed. Keyed
 * by PUUID (server-side only, like match details). Empty `t` when Riot sent no frames.
 */
export interface MatchFrames {
  t: number[];
  p: Record<string, MatchFramePlayer>;
}

export interface MatchFramePlayer {
  g: number[];
  x: number[];
  c: number[];
  /*
    Kept from 20 Nov 2026 on (absent on older timelines), each only when Riot sent it in every
    frame the player has: a gap leaves that one series out rather than filling it in.
  */
  /** Where the champion stood, in Riot's map units (x and y apart, aligned with `t`). */
  px?: number[];
  py?: number[];
  /** Ability haste (Riot's championStats.abilityHaste). */
  ah?: number[];
  /** Champion level. */
  lv?: number[];
}

export interface MatchTimelineParticipant {
  puuid: string;
  /** Items bought, in order: [milliseconds into the game, item id]. */
  purchases: Array<[number, number]>;
  /** Skill slots levelled, in order (1 = Q, 2 = W, 3 = E, 4 = R). */
  skills: number[];
  /**
   * Champion kills the player made, died in and assisted, in milliseconds into the game (absent on
   * timelines stored before 29 Oct 2026). They go with the entry: a removed player's go with theirs.
   */
  kills?: number[];
  deaths?: number[];
  assists?: number[];
  /*
    Kept from 20 Nov 2026 on, on timelines whose events carry `plates` (older ones never had them),
    and only when there is something to keep: on such a timeline an absent list means none.
  */
  /**
   * When the champion reached each level (ms into the game, from Riot's LEVEL_UP events): the first
   * entry is level `levelFrom` (2 unless given), each next one a level more. Left out when Riot's
   * events skip or repeat a level, rather than guessed.
   */
  levels?: number[];
  /** The level `levels` starts at, only when it is not 2. */
  levelFrom?: number;
  /** Items sold, in order: [ms, item id] (an undone sale removed). */
  sold?: Array<[number, number]>;
  /**
   * Items used up or turned into another, in order: [ms, item id], as Riot reports them (a potion
   * drunk, a ward placed, components consumed by the item they built); those of an undone purchase
   * removed.
   */
  destroyed?: Array<[number, number]>;
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
  /** Riot's team position, or its individual position when the team position is empty: what every record keeps. */
  position: string | null;
  /**
   * Riot's two readings of the position, as sent ("" when Riot sent none), on records stored from
   * 20 Nov 2026 on (absent on older ones, which keep only the merged `position`): `teamPosition` is
   * its assignment with one player per position on each team, `individualPosition` its reading of
   * the player alone ("Invalid" when it has none). The lane opponent rule reads them
   * (domain/match-analysis `laneOpponentOf`).
   */
  teamPosition?: string;
  individualPosition?: string;
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
   * records stored from this phase on (older records have only the keystone and paths). `shards`:
   * the three stat shards [offense, flex, defense] (Riot's perk ids, 5001–5013), on records stored
   * from 20 Nov 2026 on when Riot sent them.
   */
  runes: { keystone: number | null; primary: number | null; secondary: number | null; primaryPerks?: number[]; secondaryPerks?: number[]; shards?: [number, number, number] } | null;
  /**
   * Extra per-game figures for Team Leaderboards, on records stored from Phase 14 on (absent on
   * older records: those games are left out of these figures, never counted as zero). Each field
   * is present only when Riot sent it.
   */
  stats?: ParticipantExtraStats;
  /**
   * Riot's lane and jungle challenge figures (its own names and values: `challenges.*` in match-v5),
   * kept as evidence from the same match request, on records stored from 20 Nov 2026 on; each one
   * only when Riot sent it. `laningPhaseGoldExpAdvantage` is Riot's own measure, which it does not
   * document: it is never shown as a "laning phase".
   */
  challenges?: LaneChallenges;
  /**
   * A player whose personal data was permanently erased (server/privacy/redact.ts): only their
   * side and the game's result are kept. PUUID "", no name, champion, position or figures (the
   * zero counts are placeholders, never shown or added up).
   */
  removed?: true;
}

export interface ParticipantExtraStats {
  doubleKills?: number;
  tripleKills?: number;
  quadraKills?: number;
  pentaKills?: number;
  largestMultiKill?: number;
  largestKillingSpree?: number;
  firstBloodKill?: boolean;
  firstBloodAssist?: boolean;
  wardsKilled?: number;
  controlWardsBought?: number;
  objectiveDamage?: number;
  buildingDamage?: number;
  turretTakedowns?: number;
  /** Seconds of crowd control applied to enemy champions (Riot's timeCCingOthers). */
  ccSeconds?: number;
  soloKills?: number;
  /*
    From 20 Nov 2026 on: figures that serve supports and tanks, whom damage alone describes poorly.
  */
  /** Seconds spent dead (Riot's totalTimeSpentDead). */
  deadSeconds?: number;
  /** Turret plates taken (Riot's challenges.turretPlatesTaken). */
  platesTaken?: number;
  /** Healing done to teammates (Riot's totalHealsOnTeammates). */
  teamHealing?: number;
  /** Damage shielded on teammates (Riot's totalDamageShieldedOnTeammates). */
  teamShielding?: number;
  /** Damage the player mitigated (Riot's damageSelfMitigated). */
  damageMitigated?: number;
}

/** The lane and jungle figures of `MatchParticipantDetail.challenges` (Riot's names; server/riot/api/schemas `LANE_CHALLENGE_KEYS`). */
export interface LaneChallenges {
  jungleCsBefore10Minutes?: number;
  initialCrabCount?: number;
  scuttleCrabKills?: number;
  enemyJungleMonsterKills?: number;
  junglerKillsEarlyJungle?: number;
  killsOnLanersEarlyJungleAsJungler?: number;
  maxCsAdvantageOnLaneOpponent?: number;
  maxLevelLeadLaneOpponent?: number;
  laningPhaseGoldExpAdvantage?: number;
  playedChampSelectPosition?: number;
}

/**
 * Ranked history of a linked account, one row per change and queue (Solo/Duo and Flex apart).
 * Riot only reports the current rank, so the first row is when tracking started: there is no
 * earlier history and none is invented. A row is written from the league entries account sync and
 * the rank watch read (server/accounts/rank-history), only when something changed since the last
 * row; an unchanged reading moves the last row's confirmed_at instead. An unranked row (tier null)
 * records a season reset.
 */
export const rankSnapshots = pgTable(
  "rank_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id").notNull().references(() => riotAccounts.id, { onDelete: "cascade" }),
    /** solo | flex */
    queue: text("queue").notNull(),
    tier: text("tier"),
    division: text("division"),
    leaguePoints: integer("league_points"),
    wins: integer("wins"),
    losses: integer("losses"),
    capturedAt: timestamp("captured_at", { withTimezone: true }).notNull().defaultNow(),
    /**
     * The last reading that still showed these values (each unchanged reading moves it on; it never
     * goes back). Null on rows stored before it was kept. A game's LP is read between this and the
     * next row's captured_at (domain/lp-attribution).
     */
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("rank_snapshots_account_queue_idx").on(t.accountId, t.queue, t.capturedAt)],
);
