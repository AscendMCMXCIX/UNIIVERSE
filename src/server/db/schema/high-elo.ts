import { doublePrecision, integer, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";

/*
  The high-elo statistics for Champion Intel's builds (docs/HIGH_ELO_EVIDENCE.md, "What is stored"):
  anonymous counts of what Master, Grandmaster and Challenger players chose in Ranked Solo/Duo games,
  PREPARED AND SWITCHED OFF (server/champion-builds/high-elo/switch.ts): nothing writes here until
  Riot's registration describes the collection and the owner switches it on. Counts only: no player,
  game or Riot ID column exists, and tests/db/high-elo.test.ts refuses one in any `high_elo_*` table
  and checks every value's form. Counts older than the previous patch are deleted by the sampler;
  it refuses to write above HIGH_ELO_MAX_BYTES.
*/

/**
 * Per champion, patch, lane, region ("all" for the build kinds; the games also per region), lane
 * opponent ("" for every opponent; the Matchup Intel band's lane kinds would use it), kind and value:
 * n the games observed; w, w2 and ww the weighted sums (Σw, Σw², Σw over the games won) that remove
 * the sampling's regional bias; wx and wx2 a measured lane kind's Σw·x and Σw·x² (reserved, 0 here).
 * The key leads with the champion, so the page's read (one champion, two patches) is a range of it.
 */
export const highEloCounts = pgTable(
  "high_elo_counts",
  {
    /** Data Dragon's id. */
    champion: text("champion").notNull(),
    /** Internal patch ("16.23"). */
    patch: text("patch").notNull(),
    /** Riot's lane: TOP, JUNGLE, MIDDLE, BOTTOM or UTILITY. */
    role: text("role").notNull(),
    /** americas, europe, asia or sea; "all" for the build kinds. */
    region: text("region").notNull(),
    opponent: text("opponent").notNull().default(""),
    /** A builds dim (games, timeline, runes, shards, spells, skills, start, boots, core, fourth, fifth); lane.* reserved. */
    kind: text("kind").notNull(),
    value: text("value").notNull().default(""),
    n: integer("n").notNull(),
    w: doublePrecision("w").notNull(),
    w2: doublePrecision("w2").notNull(),
    ww: doublePrecision("ww").notNull(),
    wx: doublePrecision("wx").notNull().default(0),
    wx2: doublePrecision("wx2").notNull().default(0),
  },
  (t) => [primaryKey({ name: "high_elo_counts_pk", columns: [t.champion, t.patch, t.role, t.region, t.opponent, t.kind, t.value] })],
);

/** Each server's sampling cursor: the end of the last window read, so every window is counted once. */
export const highEloCursors = pgTable("high_elo_cursors", {
  /** Riot's platform routing value ("euw1"): a server, not a person. */
  platform: text("platform").primaryKey(),
  windowEnd: timestamp("window_end", { withTimezone: true }).notNull(),
  visits: integer("visits").notNull().default(0),
  games: integer("games").notNull().default(0),
});

/** Each server's Master+ population at its last ladder read: counts only (the lists are never stored). */
export const highEloPopulation = pgTable("high_elo_population", {
  platform: text("platform").primaryKey(),
  challenger: integer("challenger").notNull(),
  grandmaster: integer("grandmaster").notNull(),
  master: integer("master").notNull(),
  readAt: timestamp("read_at", { withTimezone: true }).notNull(),
});
