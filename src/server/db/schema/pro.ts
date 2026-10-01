import { index, integer, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";
import { roleEnum, sideEnum } from "./common";

/** One professional game, from whichever provider supplied it. */
export const proGames = pgTable(
  "pro_games",
  {
    id: text("id").primaryKey(), // provider-scoped id, e.g. "oe:ESPORTSTMNT01_123" or "lp:2025 LEC Summer_Week 1_1_1"
    provider: text("provider").notNull(),
    tournament: text("tournament").notNull().default(""),
    league: text("league").notNull().default(""),
    patch: text("patch").notNull(),
    playedAt: timestamp("played_at", { withTimezone: true }),
    blueTeam: text("blue_team").notNull().default(""),
    redTeam: text("red_team").notNull().default(""),
    winnerSide: sideEnum("winner_side"),
    importedAt: timestamp("imported_at", { withTimezone: true }).notNull().defaultNow(),
    aggregatedAt: timestamp("aggregated_at", { withTimezone: true }),
  },
  (t) => [index("pro_games_patch_idx").on(t.patch), index("pro_games_aggregated_idx").on(t.aggregatedAt)],
);

export const proGamePicks = pgTable(
  "pro_game_picks",
  {
    gameId: text("game_id").notNull().references(() => proGames.id, { onDelete: "cascade" }),
    side: sideEnum("side").notNull(),
    role: roleEnum("role").notNull(),
    championId: text("champion_id").notNull(),
    /** 1-5 pick order within the side when known, else 0. */
    pickOrder: integer("pick_order").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.gameId, t.side, t.role] })],
);

export const proGameBans = pgTable(
  "pro_game_bans",
  {
    gameId: text("game_id").notNull().references(() => proGames.id, { onDelete: "cascade" }),
    side: sideEnum("side").notNull(),
    banOrder: integer("ban_order").notNull(),
    championId: text("champion_id").notNull(),
  },
  (t) => [primaryKey({ columns: [t.gameId, t.side, t.banOrder] })],
);
