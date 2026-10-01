import { integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { roleEnum, scoutingConfidenceEnum, timestamps } from "./common";
import { teams } from "./team";

/** Opponent teams are optional reference data; nothing in the draft depends on them existing. */
export const opponentTeams = pgTable("opponent_teams", {
  id: uuid("id").primaryKey().defaultRandom(),
  teamId: uuid("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  aliases: jsonb("aliases").$type<string[]>().notNull().default([]),
  notes: text("notes").notNull().default(""),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  ...timestamps,
});

export const opponentPlayers = pgTable("opponent_players", {
  id: uuid("id").primaryKey().defaultRandom(),
  opponentTeamId: uuid("opponent_team_id").notNull().references(() => opponentTeams.id, { onDelete: "cascade" }),
  /** Human label, e.g. "Enemy Top" or the player's known name. */
  label: text("label").notNull(),
  aliases: jsonb("aliases").$type<string[]>().notNull().default([]),
  likelyRole: roleEnum("likely_role"),
  altRole: roleEnum("alt_role"),
  confidence: scoutingConfidenceEnum("confidence").notNull().default("unknown"),
  notes: text("notes").notNull().default(""),
  sortOrder: integer("sort_order").notNull().default(0),
  ...timestamps,
});
