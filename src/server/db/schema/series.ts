import { index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { competitionModeEnum, seriesStatusEnum, timestamps } from "./common";
import { teams } from "./team";
import { users } from "./auth";

/**
 * A best-of series: a container for several games against the same opponent in one session.
 * Every game keeps its own draft, side, lineup, playbook and match record; the series only
 * carries the shared context (mode, event, opponent label) and the running score. Archive
 * only: nothing here feeds the engine.
 */
export const series = pgTable(
  "series",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    mode: competitionModeEnum("mode").notNull().default("tournament"),
    /** The account that started the series (it manages it; admins may override). */
    createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    eventName: text("event_name").notNull().default(""),
    opponentName: text("opponent_name").notNull().default(""),
    /** 1, 3 or 5. */
    bestOf: integer("best_of").notNull().default(1),
    /** "standard" | "fearless" (Full Fearless: champions picked in earlier games of the series are unavailable to both teams). */
    draftRules: text("draft_rules").notNull().default("standard"),
    status: seriesStatusEnum("status").notNull().default("in_progress"),
    ourWins: integer("our_wins").notNull().default(0),
    theirWins: integer("their_wins").notNull().default(0),
    /** "us" | "them" once decided (by score or by ending the series early). */
    winner: text("winner"),
    notes: text("notes").notNull().default(""),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index("series_team_created_idx").on(t.teamId, t.createdAt)],
);
