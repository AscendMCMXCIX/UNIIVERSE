import { sql } from "drizzle-orm";
import { boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { timestamps, userRoleEnum } from "./common";
import { players } from "./team";

/**
 * Application accounts. Identity is the username (unique, case-insensitive) plus the player's
 * Riot ID on their profile; an account is created together with its player profile by an admin.
 * There is no email anywhere in the model: nothing is sent, nothing is stored.
 * Admins (role "owner") sign in with a password. Players sign in with single-use activation
 * codes an admin issues (see activation_codes); a password left from before passwordless
 * sign-in keeps working until the player first redeems a code.
 * The "coach" enum value and `draft_lead` are retired (migration 0007) and kept only so an
 * older deployment can still read the table during a rollout.
 */
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    username: text("username").notNull(),
    displayName: text("display_name").notNull(),
    passwordHash: text("password_hash"),
    role: userRoleEnum("role").notNull().default("player"),
    /** Retired (Draft Lead was removed in migration 0007); always false, kept for rollback compatibility. */
    draftLead: boolean("draft_lead").notNull().default(false),
    playerId: uuid("player_id").references(() => players.id, { onDelete: "set null" }),
    isActive: boolean("is_active").notNull().default(true),
    /** Set when the player finished first-login setup (roles and pools); null until then, which keeps them on /welcome. */
    setupCompletedAt: timestamp("setup_completed_at", { withTimezone: true }),
    /** Partial first-login setup, saved as the player goes so a refresh or a closed tab resumes where they were. */
    setupProgress: jsonb("setup_progress").$type<SetupProgress | null>(),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [uniqueIndex("users_username_lower_idx").on(sql`lower(${t.username})`), uniqueIndex("users_player_idx").on(t.playerId)],
);

export interface SetupProgress {
  primaryRole?: string | null;
  primaryPool?: string[];
  secondaryRole?: string | null;
  secondaryPool?: string[];
}

/**
 * Single-use activation codes: how players sign in without a password. An admin issues one;
 * only its SHA-256 hash is stored (the code is high-entropy, shown once). A code expires, is
 * consumed atomically on use, and is burned after too many wrong guesses. Issuing a new code
 * revokes the user's unused ones.
 */
export const activationCodes = pgTable(
  "activation_codes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    codeHash: text("code_hash").notNull(),
    createdByUserId: uuid("created_by_user_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    failedAttempts: integer("failed_attempts").notNull().default(0),
  },
  (t) => [uniqueIndex("activation_codes_hash_idx").on(t.codeHash), index("activation_codes_user_idx").on(t.userId)],
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

/**
 * Invite links: retired (migration 0007 expired every unused one; the invite page now explains
 * activation codes). Kept for history and rollback compatibility.
 */
export const invites = pgTable(
  "invites",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    token: text("token").notNull(),
    role: userRoleEnum("role").notNull().default("player"),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
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
