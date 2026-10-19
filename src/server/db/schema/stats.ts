import { index, integer, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";
import { roleEnum, statSourceEnum } from "./common";

// Retired with Meta & Trends: nothing reads or writes these tables any more. They stay defined so
// drizzle-kit never generates a DROP; dropping them is a separate, approval-gated migration
// (docs/DATA_PIPELINES.md, "Retired tables").

/**
 * Aggregated statistics are keyed by patch and source and are never overwritten when a new
 * patch arrives: a new patch simply starts a new period.
 */
export const statPeriods = pgTable(
  "stat_periods",
  {
    patch: text("patch").notNull(),
    source: statSourceEnum("source").notNull(),
    games: integer("games").notNull().default(0),
    firstGameAt: timestamp("first_game_at", { withTimezone: true }),
    lastGameAt: timestamp("last_game_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.patch, t.source] })],
);

/**
 * Provenance of the aggregated games per region: how many games each platform contributed to a
 * (patch, source) period, from which queue and ladder population, and how fresh they are. Lets
 * the UI say which regions stand behind a number without touching raw matches.
 */
export const statRegionPeriods = pgTable(
  "stat_region_periods",
  {
    patch: text("patch").notNull(),
    source: statSourceEnum("source").notNull(),
    /** Riot platform id, or "pro" for professional games (no server). */
    platform: text("platform").notNull(),
    /** Riot queue id (420 = ranked solo) or 0 when not applicable. */
    queueId: integer("queue_id").notNull().default(420),
    /** Ladder population the games were sampled from, e.g. "MASTER+" or "PRO". */
    tierPopulation: text("tier_population").notNull().default("MASTER+"),
    games: integer("games").notNull().default(0),
    firstGameAt: timestamp("first_game_at", { withTimezone: true }),
    lastGameAt: timestamp("last_game_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.patch, t.source, t.platform] })],
);

/**
 * Provenance of the ranked sample per ladder band: how many games each band (EMERALD, DIAMOND,
 * MASTER, GRANDMASTER, CHALLENGER; "MASTER+" for matches stored before bands were recorded)
 * contributed to a (patch, source) period. Lets Data health say which populations are covered.
 */
export const statRankPeriods = pgTable(
  "stat_rank_periods",
  {
    patch: text("patch").notNull(),
    source: statSourceEnum("source").notNull(),
    tierBand: text("tier_band").notNull(),
    games: integer("games").notNull().default(0),
    firstGameAt: timestamp("first_game_at", { withTimezone: true }),
    lastGameAt: timestamp("last_game_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.patch, t.source, t.tierBand] })],
);

/*
  Every champion aggregate is keyed by ladder band as well, so Emerald volume and Challenger
  quality stay separable: the loader weights bands when it blends them, and the raw counts
  remain honest provenance. Rows aggregated before bands existed carry "MASTER+".
*/
export const championRoleStats = pgTable(
  "champion_role_stats",
  {
    patch: text("patch").notNull(),
    source: statSourceEnum("source").notNull(),
    tierBand: text("tier_band").notNull().default("MASTER+"),
    championId: text("champion_id").notNull(),
    role: roleEnum("role").notNull(),
    games: integer("games").notNull().default(0),
    wins: integer("wins").notNull().default(0),
    /** Bans are not role specific; stored on every role row for convenience of joins, but the
     * canonical ban count lives in championBanStats. */
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.patch, t.source, t.tierBand, t.championId, t.role] }), index("crs_patch_source_idx").on(t.patch, t.source)],
);

export const championBanStats = pgTable(
  "champion_ban_stats",
  {
    patch: text("patch").notNull(),
    source: statSourceEnum("source").notNull(),
    tierBand: text("tier_band").notNull().default("MASTER+"),
    championId: text("champion_id").notNull(),
    bans: integer("bans").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.patch, t.source, t.tierBand, t.championId] })],
);

/** Lane/role matchups: champion in role vs enemy champion in enemy role. */
export const championMatchups = pgTable(
  "champion_matchups",
  {
    patch: text("patch").notNull(),
    source: statSourceEnum("source").notNull(),
    tierBand: text("tier_band").notNull().default("MASTER+"),
    championId: text("champion_id").notNull(),
    role: roleEnum("role").notNull(),
    enemyChampionId: text("enemy_champion_id").notNull(),
    enemyRole: roleEnum("enemy_role").notNull(),
    games: integer("games").notNull().default(0),
    wins: integer("wins").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.patch, t.source, t.tierBand, t.championId, t.role, t.enemyChampionId, t.enemyRole] }),
    index("matchups_champion_idx").on(t.patch, t.source, t.championId, t.role),
  ],
);

/** Ally pair synergies, stored once per unordered pair (championA < championB). */
export const championSynergies = pgTable(
  "champion_synergies",
  {
    patch: text("patch").notNull(),
    source: statSourceEnum("source").notNull(),
    tierBand: text("tier_band").notNull().default("MASTER+"),
    championAId: text("champion_a_id").notNull(),
    roleA: roleEnum("role_a").notNull(),
    championBId: text("champion_b_id").notNull(),
    roleB: roleEnum("role_b").notNull(),
    games: integer("games").notNull().default(0),
    wins: integer("wins").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.patch, t.source, t.tierBand, t.championAId, t.roleA, t.championBId, t.roleB] }),
    index("synergies_a_idx").on(t.patch, t.source, t.championAId),
    index("synergies_b_idx").on(t.patch, t.source, t.championBId),
  ],
);

/** Professional draft patterns: how often a champion is taken in a given draft slot (B1, R1/R2, …). */
export const proPickSlotStats = pgTable(
  "pro_pick_slot_stats",
  {
    patch: text("patch").notNull(),
    championId: text("champion_id").notNull(),
    /** B1 | R1R2 | B2B3 | R3 | R4 | B4B5 | R5 | BAN1 | BAN2 */
    slot: text("slot").notNull(),
    role: roleEnum("role"),
    games: integer("games").notNull().default(0),
    wins: integer("wins").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.patch, t.championId, t.slot] })],
);
