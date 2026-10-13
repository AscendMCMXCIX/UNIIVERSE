import { sql } from "drizzle-orm";
import { boolean, index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { timestamps, userRoleEnum } from "./common";
import { players } from "./team";

/**
 * Application accounts. Identity is the username (unique, case-insensitive) plus the player's
 * Riot ID on their profile; a normal account is created together with its player profile.
 * There is no email anywhere in the model: nothing is sent, nothing is stored.
 * The password is optional at creation: without one the account can only be used from the
 * browser session that created it until a password is set.
 * Owners manage everything; coaches run drafts and matches; players manage their own profile.
 */
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    username: text("username").notNull(),
    displayName: text("display_name").notNull(),
    passwordHash: text("password_hash"),
    role: userRoleEnum("role").notNull().default("player"),
    playerId: uuid("player_id").references(() => players.id, { onDelete: "set null" }),
    isActive: boolean("is_active").notNull().default(true),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [uniqueIndex("users_username_lower_idx").on(sql`lower(${t.username})`), uniqueIndex("users_player_idx").on(t.playerId)],
);

/**
 * Server-side login sessions. The browser holds a random token in an HTTP-only cookie; only its
 * hash is stored, so a database leak cannot be replayed. Logging out deletes the row, a password
 * change deletes every row of that user, and expiry is enforced on every request.
 */
export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    remember: boolean("remember").notNull().default(false),
    userAgent: text("user_agent").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [uniqueIndex("sessions_token_hash_idx").on(t.tokenHash), index("sessions_user_idx").on(t.userId), index("sessions_expires_idx").on(t.expiresAt)],
);

/** Invite links. Optionally bound to a placeholder player profile that the invitee takes over (no duplicates). */
export const invites = pgTable(
  "invites",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    token: text("token").notNull(),
    role: userRoleEnum("role").notNull().default("player"),
    playerId: uuid("player_id").references(() => players.id, { onDelete: "set null" }),
    note: text("note").notNull().default(""),
    createdByUserId: uuid("created_by_user_id"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    usedByUserId: uuid("used_by_user_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("invites_token_idx").on(t.token)],
);
