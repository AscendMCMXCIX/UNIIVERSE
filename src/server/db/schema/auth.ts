import { boolean, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { timestamps, userRoleEnum } from "./common";
import { players } from "./team";

/**
 * Application accounts. A user may be linked to exactly one player profile (claimed via invite).
 * Owners manage everything; coaches run drafts, scouting and matches; players manage their own
 * profile and watch drafts.
 */
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    displayName: text("display_name").notNull(),
    passwordHash: text("password_hash").notNull(),
    role: userRoleEnum("role").notNull().default("player"),
    playerId: uuid("player_id").references(() => players.id, { onDelete: "set null" }),
    isActive: boolean("is_active").notNull().default(true),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [uniqueIndex("users_email_idx").on(t.email), uniqueIndex("users_player_idx").on(t.playerId)],
);

/** Invite links. Optionally bound to an existing player profile so the invitee claims it (no duplicates). */
export const invites = pgTable(
  "invites",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    token: text("token").notNull(),
    role: userRoleEnum("role").notNull().default("player"),
    playerId: uuid("player_id").references(() => players.id, { onDelete: "set null" }),
    email: text("email"),
    note: text("note").notNull().default(""),
    createdByUserId: uuid("created_by_user_id"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    usedByUserId: uuid("used_by_user_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("invites_token_idx").on(t.token)],
);
