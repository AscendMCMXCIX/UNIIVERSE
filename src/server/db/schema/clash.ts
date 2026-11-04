import { index, jsonb, pgTable, primaryKey, smallint, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { teams } from "./team";
import { users } from "./auth";

// Retired with Clash Scout: no page, action or job reads or writes these tables any more, apart
// from permanent erasure and its reconciliation (server/privacy), which still clear an erased
// person from the scouts saved before the retirement. They stay defined so drizzle-kit never
// generates a DROP; dropping them is a separate migration, held until a recent backup has been
// verified (docs/DATA_PIPELINES.md, "Retired tables").

/** One player of a saved scout, as far as erasure reads it (the stored JSON holds more). */
export interface RetiredScoutPlayer {
  /** 0–4, the column of Clash's scouting screens. */
  slot: number;
  /** The name as read or typed. */
  name: string;
  /** "verified" when a member had Riot confirm the Riot ID; only then are `riotId` and `puuid` set. */
  verification: string;
  riotId: string | null;
  puuid: string | null;
  [field: string]: unknown;
}

/** A saved scout's snapshot, as far as erasure reads it. */
export interface RetiredScoutContent {
  opponentName: string;
  tournament: { name: string | null; [field: string]: unknown };
  players: RetiredScoutPlayer[];
  [field: string]: unknown;
}

/** Scouting sessions the team saved: one row per scout, never a screenshot. */
export const clashScouts = pgTable(
  "clash_scouts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    teamId: uuid("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
    opponentName: text("opponent_name").notNull(),
    platform: text("platform").notNull(),
    tournamentName: text("tournament_name"),
    content: jsonb("content").$type<RetiredScoutContent>().notNull(),
    /** Players with a name, and accounts Riot verified (for the history list without reading content). */
    playersCaptured: smallint("players_captured").notNull().default(0),
    playersVerified: smallint("players_verified").notNull().default(0),
    /** Lower-cased opponent and player names, for searching the history. */
    searchText: text("search_text").notNull().default(""),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    scoutedAt: timestamp("scouted_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("clash_scouts_team_idx").on(t.teamId, t.scoutedAt)],
);

/** The Riot-verified accounts of each saved scout (PUUID only, never names). */
export const clashScoutAccounts = pgTable(
  "clash_scout_accounts",
  {
    scoutId: uuid("scout_id").notNull().references(() => clashScouts.id, { onDelete: "cascade" }),
    teamId: uuid("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
    slot: smallint("slot").notNull(),
    puuid: text("puuid").notNull(),
  },
  (t) => [primaryKey({ columns: [t.scoutId, t.slot] }), index("clash_scout_accounts_puuid_idx").on(t.teamId, t.puuid)],
);
