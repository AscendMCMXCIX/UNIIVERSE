import { sql } from "drizzle-orm";
import { boolean, index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid, type AnyPgColumn } from "drizzle-orm/pg-core";
import { roleEnum, timestamps } from "./common";
import { players } from "./team";

/*
  Retired with Ranked Development (docs/RANKED_DEVELOPMENT.md): a player's own improvement library.
  Nothing reads these tables or writes to them any more; their rows are kept until a separate,
  approval-gated clean-up deletes them. They stay defined so drizzle-kit never generates a DROP.
  Every row belongs to one player and goes with the player when their profile is deleted (foreign
  keys cascade) or their personal information is removed (server/privacy/erasure.ts).
*/

/** One skill the player is developing (the weakness library). */
export const developmentObjectives = pgTable(
  "development_objectives",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    playerId: uuid("player_id").notNull().references(() => players.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    /** A short explanation in the player's words (may be empty). */
    detail: text("detail").notNull().default(""),
    /** The area it was about (an area key, or "custom"). */
    category: text("category").notNull(),
    /** The player's own area name when `category` is "custom". */
    customCategory: text("custom_category"),
    /** The role it is about; null for any role. */
    role: roleEnum("role"),
    /** Champions it is about; empty for any champion. */
    championIds: jsonb("champion_ids").$type<string[]>().notNull().default([]),
    /** identified | practising | improving | maintaining. */
    status: text("status").notNull().default("identified"),
    /** The one objective sessions start with; at most one per player (partial unique index). */
    isPrimary: boolean("is_primary").notNull().default(false),
    /** The statistic followed for it, or null to rely on reviews. */
    measure: text("measure"),
    /** The current If–Then plan; older versions stay in development_plans. */
    planId: uuid("plan_id").references((): AnyPgColumn => developmentPlans.id, { onDelete: "set null" }),
    identifiedAt: timestamp("identified_at", { withTimezone: true }).notNull().defaultNow(),
    statusChangedAt: timestamp("status_changed_at", { withTimezone: true }).notNull().defaultNow(),
    /** "player", or "blocks-focus" for the focus migration 0059 carried over from Solo Queue Blocks. */
    source: text("source").notNull().default("player"),
    ...timestamps,
  },
  (t) => [index("development_objectives_player_idx").on(t.playerId, t.status), uniqueIndex("development_objectives_one_primary_idx").on(t.playerId).where(sql`${t.isPrimary}`)],
);

/**
 * An If–Then action plan. A plan sessions or reviews used is never rewritten: editing it retires
 * it (`retired_at`) and a new version takes its place, so history shows what was played with.
 */
export const developmentPlans = pgTable(
  "development_plans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    playerId: uuid("player_id").notNull().references(() => players.id, { onDelete: "cascade" }),
    objectiveId: uuid("objective_id").references((): AnyPgColumn => developmentObjectives.id, { onDelete: "set null" }),
    ifText: text("if_text").notNull(),
    thenText: text("then_text").notNull(),
    /** The template it started from, if any. */
    templateKey: text("template_key"),
    /** Set when the plan was replaced by a newer version or put away; null while in use. */
    retiredAt: timestamp("retired_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index("development_plans_player_idx").on(t.playerId, t.objectiveId)],
);
