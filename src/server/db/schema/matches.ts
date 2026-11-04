import { pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { players, teams } from "./team";
import { users } from "./auth";

/**
 * Riot games the team wants to find again (Matches → Bookmarked). A game played together is
 * bookmarked by any member who can see it; a member's own game that no teammate played is only
 * here because that member shared it (playerId), and only they or a match manager remove it.
 */
export const teamBookmarks = pgTable(
  "team_bookmarks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    teamId: uuid("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
    riotMatchId: text("riot_match_id").notNull(),
    /** Set when a member shared one of their own games; null for a game played together. */
    playerId: uuid("player_id").references(() => players.id, { onDelete: "cascade" }),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    note: text("note").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("team_bookmarks_team_match_idx").on(t.teamId, t.riotMatchId)],
);
