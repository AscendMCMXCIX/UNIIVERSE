import { pgEnum, timestamp } from "drizzle-orm/pg-core";
import { ROLES } from "@/domain/roles";

export const roleEnum = pgEnum("role", ROLES);
export const sideEnum = pgEnum("side", ["blue", "red"]);
export const playerGroupEnum = pgEnum("player_group", ["main", "other"]);
export const poolSlotEnum = pgEnum("pool_slot", ["primary", "secondary"]);
export const draftStatusEnum = pgEnum("draft_status", ["in_progress", "completed", "abandoned"]);
export const actionTypeEnum = pgEnum("action_type", ["ban", "pick"]);
export const statSourceEnum = pgEnum("stat_source", ["ranked", "pro", "demo"]);
export const refreshStatusEnum = pgEnum("refresh_status", ["never", "ok", "degraded", "failed", "running"]);
export const competitionModeEnum = pgEnum("competition_mode", ["ranked-flex", "clash", "scrim", "tournament", "custom", "practice", "other"]);
export const seriesStatusEnum = pgEnum("series_status", ["in_progress", "completed", "cancelled"]);
export const userRoleEnum = pgEnum("user_role", ["owner", "coach", "player"]);
export const accountOwnerEnum = pgEnum("account_owner", ["player", "opponent"]);
export const scoutingConfidenceEnum = pgEnum("scouting_confidence", ["high", "medium", "low", "unknown"]);
export const matchResultEnum = pgEnum("match_result", ["win", "loss", "cancelled"]);

export const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};
