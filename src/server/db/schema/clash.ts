import { index, jsonb, pgTable, primaryKey, smallint, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { teams } from "./team";
import { users } from "./auth";
import type { ScoutContent } from "@/domain/clash-scout/types";

/**
 * Clash Scout: scouting sessions the team chose to save. One row per scout, belonging to a team;
 * `content` is the snapshot of what the two Clash screenshots showed (names, ranks, champion
 * figures, mastery, and Riot-verified accounts), validated and bounded on the way in
 * (domain/clash-scout/schema.ts). Screenshots are never stored. Drafts are never stored either:
 * they stay in the browser until a member saves. Row Level Security is on with no policies, so
 * only the app's own database role (the table owner) reaches the rows; every query is scoped to
 * the team on the server.
 */
export const clashScouts = pgTable(
  "clash_scouts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    teamId: uuid("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
    opponentName: text("opponent_name").notNull(),
    platform: text("platform").notNull(),
    tournamentName: text("tournament_name"),
    content: jsonb("content").$type<ScoutContent>().notNull(),
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

/**
 * The Riot-verified accounts of each saved scout (PUUID only), so a new scout can recognise an
 * account the team scouted before without reading every snapshot. Never names: an account is
 * recognised by Riot's stable id, not by a name that looks alike.
 */
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
