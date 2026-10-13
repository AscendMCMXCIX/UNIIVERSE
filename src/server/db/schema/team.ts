import { boolean, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { playerGroupEnum, poolSlotEnum, roleEnum, timestamps } from "./common";
import { champions } from "./riot-static";

export const teams = pgTable("teams", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  /** Pool limits and engine configuration overrides live here so they can change without code. */
  primaryPoolLimit: integer("primary_pool_limit").notNull().default(6),
  secondaryPoolLimit: integer("secondary_pool_limit").notNull().default(3),
  engineConfig: jsonb("engine_config").$type<Record<string, unknown>>().notNull().default({}),
  ...timestamps,
});

export const players = pgTable("players", {
  id: uuid("id").primaryKey().defaultRandom(),
  teamId: uuid("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
  displayName: text("display_name").notNull(),
  riotId: text("riot_id"),
  primaryRole: roleEnum("primary_role").notNull(),
  secondaryRole: roleEnum("secondary_role"),
  notes: text("notes").notNull().default(""),
  group: playerGroupEnum("group").notNull().default("main"),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  sortOrder: integer("sort_order").notNull().default(0),
  ...timestamps,
});

export const playerChampionPools = pgTable(
  "player_champion_pools",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    playerId: uuid("player_id").notNull().references(() => players.id, { onDelete: "cascade" }),
    slot: poolSlotEnum("slot").notNull(),
    championId: text("champion_id").notNull().references(() => champions.id, { onDelete: "restrict" }),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("pool_player_slot_champion_idx").on(t.playerId, t.slot, t.championId)],
);

/**
 * A lineup is a named set of five role assignments. Exactly one lineup per team is current.
 * Players keep their profiles regardless of lineup membership.
 */
export const lineups = pgTable("lineups", {
  id: uuid("id").primaryKey().defaultRandom(),
  teamId: uuid("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
  name: text("name").notNull().default("Active lineup"),
  isCurrent: boolean("is_current").notNull().default(false),
  /** Saved lineups are named presets; recent lineups are remembered automatically when a draft starts. */
  isSaved: boolean("is_saved").notNull().default(false),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  ...timestamps,
});

export const lineupSlots = pgTable(
  "lineup_slots",
  {
    lineupId: uuid("lineup_id").notNull().references(() => lineups.id, { onDelete: "cascade" }),
    role: roleEnum("role").notNull(),
    playerId: uuid("player_id").notNull().references(() => players.id, { onDelete: "cascade" }),
  },
  (t) => [uniqueIndex("lineup_role_idx").on(t.lineupId, t.role), uniqueIndex("lineup_player_idx").on(t.lineupId, t.playerId)],
);
