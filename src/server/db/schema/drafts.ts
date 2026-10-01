import { integer, jsonb, pgTable, serial, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { actionTypeEnum, draftStatusEnum, roleEnum, sideEnum, timestamps } from "./common";
import { teams } from "./team";
import type { Role } from "@/domain/roles";

/** Snapshot of a player at draft time so history stays accurate when pools change later. */
export interface LineupSnapshotPlayer {
  id: string;
  displayName: string;
  group: "main" | "other";
  primaryRole: Role;
  secondaryRole: Role | null;
  primaryPool: string[];
  secondaryPool: string[];
}

export const drafts = pgTable("drafts", {
  id: uuid("id").primaryKey().defaultRandom(),
  teamId: uuid("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
  opponentName: text("opponent_name").notNull().default(""),
  side: sideEnum("side").notNull(),
  patch: text("patch").notNull(),
  status: draftStatusEnum("status").notNull().default("in_progress"),
  lineupSnapshot: jsonb("lineup_snapshot").$type<LineupSnapshotPlayer[]>().notNull(),
  initialAssignments: jsonb("initial_assignments").$type<Record<Role, string>>().notNull(),
  currentAssignments: jsonb("current_assignments").$type<Record<Role, string>>().notNull(),
  unavailableChampionIds: jsonb("unavailable_champion_ids").$type<string[]>().notNull().default([]),
  finalAnalysis: jsonb("final_analysis").$type<Record<string, unknown> | null>(),
  notes: text("notes").notNull().default(""),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  ...timestamps,
});

export const draftActions = pgTable(
  "draft_actions",
  {
    id: serial("id").primaryKey(),
    draftId: uuid("draft_id").notNull().references(() => drafts.id, { onDelete: "cascade" }),
    sequenceIndex: integer("sequence_index").notNull(),
    type: actionTypeEnum("type").notNull(),
    side: sideEnum("side").notNull(),
    championId: text("champion_id"),
    playerId: uuid("player_id"),
    role: roleEnum("role"),
    /** What UNIIVERSE recommended at this moment (for later draft review). */
    recommendationSnapshot: jsonb("recommendation_snapshot").$type<Record<string, unknown> | null>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("draft_action_sequence_idx").on(t.draftId, t.sequenceIndex)],
);

export const draftRoleSwaps = pgTable("draft_role_swaps", {
  id: serial("id").primaryKey(),
  draftId: uuid("draft_id").notNull().references(() => drafts.id, { onDelete: "cascade" }),
  afterSequenceIndex: integer("after_sequence_index").notNull(),
  assignments: jsonb("assignments").$type<Record<Role, string>>().notNull(),
  reason: text("reason").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
