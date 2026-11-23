import { sql } from "drizzle-orm";
import { foreignKey, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";
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
