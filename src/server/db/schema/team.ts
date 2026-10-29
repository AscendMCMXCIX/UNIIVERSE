import { boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { bytea, playerGroupEnum, poolSlotEnum, roleEnum, timestamps } from "./common";
import { champions } from "./riot-static";
import type { Role } from "@/domain/roles";
import type { SocialLinks } from "@/domain/social-links";

export const teams = pgTable("teams", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  /** Pool limits and engine configuration overrides live here so they can change without code. */
  primaryPoolLimit: integer("primary_pool_limit").notNull().default(6),
  secondaryPoolLimit: integer("secondary_pool_limit").notNull().default(3),
  engineConfig: jsonb("engine_config").$type<Record<string, unknown>>().notNull().default({}),
  ...timestamps,
});

export const players = pgTable(
  "players",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    teamId: uuid("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
    displayName: text("display_name").notNull(),
    riotId: text("riot_id"),
    /** Null until the player chooses it during setup (accounts are created without one). */
    primaryRole: roleEnum("primary_role"),
    secondaryRole: roleEnum("secondary_role"),
    /** Optional further roles after the secondary one, in preference order (never the primary or secondary role). */
    additionalRoles: jsonb("additional_roles").$type<Role[]>().notNull().default([]),
    /** The champion shown on the player's card (splash art); null = the first champion of the primary pool. */
    featuredChampionId: text("featured_champion_id"),
    /** Skin art of the featured champion (Data Dragon art index; null or 0 = the default skin). */
    featuredSkinNum: integer("featured_skin_num"),
    /** Optional card accent ("default" | "gold" | "teal" | "violet" | "rose"); null = the theme accent. */
    cardAccent: text("card_accent"),
    /** Player Card Studio settings (domain/card-style.ts); null = the card as it was before the Studio. */
    cardStyle: jsonb("card_style").$type<Record<string, unknown>>(),
    /** Version of the uploaded card banner (player_card_banners); null = no banner. */
    cardBannerVersion: integer("card_banner_version"),
    notes: text("notes").notNull().default(""),
    group: playerGroupEnum("group").notNull().default("main"),
    /**
     * Member of the competitive team (Phase 10): Team pages, the Players directory and lineup
     * selection. False = personal use only (their own profile and statistics).
     * Every profile from before Phase 10 is a member.
     */
    teamMember: boolean("team_member").notNull().default(true),
    /**
     * The member's own consent to a public profile (Public / Guest View): false until they turn it
     * on in Settings. Only they can change it; an admin enabling the public site never does. Separate
     * from team membership: a member who has not opted in stays fully visible to signed-in members
     * and appears to visitors only as an anonymous role placeholder.
     */
    /** The member's own choice to appear on the public pages (Settings → Public profile); only they change it. */
    publicProfile: boolean("public_profile").notNull().default(false),
    /** The name shown on the public pages, chosen by the member (never their sign-in username unless they type it). */
    publicName: text("public_name"),
    /**
     * Optional YouTube, Twitch and Discord (domain/social-links), each with who may see it, chosen
     * by the member in Settings; null = none. Shown only through visibleSocialLinks, never because
     * a value is stored.
     */
    socialLinks: jsonb("social_links").$type<SocialLinks>(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    sortOrder: integer("sort_order").notNull().default(0),
    ...timestamps,
  },
  (t) => [index("players_team_idx").on(t.teamId, t.archivedAt)],
);

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

/** Champion pools for a player's additional roles (primary and secondary pools stay in player_champion_pools). */
export const playerRolePools = pgTable(
  "player_role_pools",
  {
    playerId: uuid("player_id").notNull().references(() => players.id, { onDelete: "cascade" }),
    role: roleEnum("role").notNull(),
    championId: text("champion_id").notNull().references(() => champions.id, { onDelete: "restrict" }),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("role_pool_player_role_champion_idx").on(t.playerId, t.role, t.championId)],
);

/**
 * Cached strength tags per player (Team cards): recomputed when the evidence behind them changes
 * (the inputs hash covers pools, roles, proficiency and season games), never on every page view.
 */
export const playerTags = pgTable("player_tags", {
  playerId: uuid("player_id").primaryKey().references(() => players.id, { onDelete: "cascade" }),
  tags: jsonb("tags").$type<Array<{ key: string; label: string; kind: string; reason: string }>>().notNull().default([]),
  inputsHash: text("inputs_hash").notNull().default(""),
  computedAt: timestamp("computed_at", { withTimezone: true }).notNull().defaultNow(),
});

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

/**
 * The designated substitute for each role of a lineup: at most one per role (the unique index),
 * chosen in Edit lineup by whoever may manage the lineup. A substitute is a bench member who lists
 * the role; a player who joins the five stops being a substitute (repositories/team.ts).
 */
export const lineupSubstitutes = pgTable(
  "lineup_substitutes",
  {
    lineupId: uuid("lineup_id").notNull().references(() => lineups.id, { onDelete: "cascade" }),
    role: roleEnum("role").notNull(),
    playerId: uuid("player_id").notNull().references(() => players.id, { onDelete: "cascade" }),
  },
  (t) => [uniqueIndex("lineup_substitute_role_idx").on(t.lineupId, t.role)],
);

/** Optional card banner per player (Player Card Studio): a resized image, validated on upload, served to members only. */
export const playerCardBanners = pgTable("player_card_banners", {
  playerId: uuid("player_id")
    .primaryKey()
    .references(() => players.id, { onDelete: "cascade" }),
  contentType: text("content_type").notNull(),
  data: bytea("data").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
