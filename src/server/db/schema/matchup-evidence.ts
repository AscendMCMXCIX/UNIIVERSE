import { sql } from "drizzle-orm";
import { doublePrecision, foreignKey, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";
import type { MatchPrep } from "@/domain/matchup-intel/prep";
import { accountMatches } from "./accounts";

/**
 * Matchup Intel's evidence from the team's own games (docs/MATCHUP_INTEL.md, "In your games"): one
 * row per member's stored game, what its record and timeline say about the member's preparation
 * (domain/matchup-intel/prep.ts). Derived data only, made again at any time from `match_details`
 * and `match_timelines` (the prep-backfill job inserts the missing rows; storing a timeline
 * replaces its game's rows). It goes with its game: deleting the `account_matches` row deletes it.
 * The page counts it in SQL, so only counts leave the database.
 */
export const accountMatchPrep = pgTable(
  "account_match_prep",
  {
    accountId: uuid("account_id").notNull(),
    matchId: text("match_id").notNull(),
    /** PREP_FORMAT of the rules that made it. */
    format: integer("format").notNull(),
    prep: jsonb("prep").$type<MatchPrep>().notNull(),
    madeAt: timestamp("made_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.accountId, t.matchId] }),
    foreignKey({ columns: [t.accountId, t.matchId], foreignColumns: [accountMatches.accountId, accountMatches.matchId], name: "account_match_prep_game_fk" }).onDelete("cascade"),
    // Matchup Intel's counts find a champion's games by its lane opponent without reading other rows.
    index("account_match_prep_vs_idx").on(sql`(${t.prep}->>'vs')`),
  ],
);

/**
 * One hash per champion, item and rune for each patch Data Dragon was read at (version-check), so
 * Matchup Intel can tell whether Riot's data changed between two patches (docs/MATCHUP_INTEL.md,
 * "Patches"): a champion's base stats and each ability's cooldown, cost and text; an item's stats,
 * gold and text; a rune's text. Static data Riot publishes; nothing about any player.
 */
export const staticDigests = pgTable(
  "static_digests",
  {
    /** The patch as stored ("16.22"). */
    patch: text("patch").notNull(),
    /** "champion" | "item" | "rune" */
    kind: text("kind").notNull(),
    /** The champion's Data Dragon id, or the item's or rune's number. */
    key: text("key").notNull(),
    hash: text("hash").notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.patch, t.kind, t.key] })],
);

/**
 * Matchup Intel's high-elo counts (docs/HIGH_ELO_EVIDENCE.md, "What is stored"): what the observed
 * Master+ players' ranked Solo/Duo games add up to, per patch, region, role, champion, lane opponent
 * ("" for every opponent), kind and value. n is the games observed; w, w2 and ww the weighted sums
 * (Σw, Σw², Σw over the games won) that remove the sampling's regional bias
 * (domain/matchup-intel/high-elo). Aggregates only: no player, game or Riot ID is stored, and a
 * schema test refuses such a column in any `mi_high_*` table. Counts older than the previous patch
 * are deleted by the sampler.
 */
export const miHighCounts = pgTable(
  "mi_high_counts",
  {
    patch: text("patch").notNull(),
    /** Riot's regional routing value: americas, europe, asia or sea. */
    region: text("region").notNull(),
    /** prep's lane: TOP, JUNGLE, MIDDLE, BOTTOM or UTILITY. */
    role: text("role").notNull(),
    champion: text("champion").notNull(),
    /** The confirmed lane opponent's champion; "" for every opponent. */
    opponent: text("opponent").notNull().default(""),
    /** games, ks, spells, start, item1, skills, max or end (domain/matchup-intel/high-elo/counts.ts). */
    kind: text("kind").notNull(),
    /** The choice, or the lane end's 30-second bucket in ms; "" for the games. */
    value: text("value").notNull().default(""),
    n: integer("n").notNull(),
    w: doublePrecision("w").notNull(),
    w2: doublePrecision("w2").notNull(),
    ww: doublePrecision("ww").notNull(),
  },
  (t) => [primaryKey({ columns: [t.patch, t.region, t.role, t.champion, t.opponent, t.kind, t.value] })],
);

/** Each server's Master+ population at its last ladder read: counts only (the lists are never stored). */
export const miHighPopulation = pgTable("mi_high_population", {
  /** Riot's platform routing value ("euw1"). */
  platform: text("platform").primaryKey(),
  challenger: integer("challenger").notNull(),
  grandmaster: integer("grandmaster").notNull(),
  master: integer("master").notNull(),
  readAt: timestamp("read_at", { withTimezone: true }).notNull(),
});

/** Each server's sampling cursor: the end of the last window read, so every window is read once. */
export const miHighCursors = pgTable("mi_high_cursors", {
  platform: text("platform").primaryKey(),
  windowEnd: timestamp("window_end", { withTimezone: true }).notNull(),
  visits: integer("visits").notNull().default(0),
  games: integer("games").notNull().default(0),
});
