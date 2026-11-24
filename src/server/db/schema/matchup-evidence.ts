import { sql } from "drizzle-orm";
import { foreignKey, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { accountMatches } from "./accounts";

/**
 * The retired Matchup Intel's evidence from the team's own games: one row per member's stored game,
 * what its record and timeline said about the member's preparation (rune page, spells, starting
 * items, skill order). Derived data only. Since Matchup Intel was retired (23 Nov 2026,
 * docs/CHAMPION_LOOKUP.md, "What is stored and not shown") nothing writes or reads it: the table
 * and its rows stay (no destructive migration), an erasure still deletes the rows of the games it
 * de-identifies (server/privacy/erasure.ts), and a row still goes with its game: deleting the
 * `account_matches` row deletes it.
 */
export const accountMatchPrep = pgTable(
  "account_match_prep",
  {
    accountId: uuid("account_id").notNull(),
    matchId: text("match_id").notNull(),
    /** PREP_FORMAT of the rules that made it. */
    format: integer("format").notNull(),
    /** The derived record as the retired rules wrote it (PREP_FORMAT `format`); read by nothing now. */
    prep: jsonb("prep").$type<Record<string, unknown>>().notNull(),
    madeAt: timestamp("made_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.accountId, t.matchId] }),
    foreignKey({ columns: [t.accountId, t.matchId], foreignColumns: [accountMatches.accountId, accountMatches.matchId], name: "account_match_prep_game_fk" }).onDelete("cascade"),
    // Matchup Intel's counts found a champion's games by its lane opponent without reading other rows (kept with the table).
    index("account_match_prep_vs_idx").on(sql`(${t.prep}->>'vs')`),
  ],
);

/**
 * One hash per champion, item and rune for each patch Data Dragon was read at (version-check), so
 * Admin's Data & Integrations and /api/health can count what changed between two patches
 * (server/riot/static/digests.ts): a champion's base stats and each ability's cooldown, ranks and
 * text; an item's stats, gold and text; a rune's text. Static data Riot publishes; nothing about any player.
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
