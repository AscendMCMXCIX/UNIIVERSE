import { sql } from "drizzle-orm";
import { boolean, index, integer, jsonb, pgTable, serial, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { bytea } from "./common";
import { timestamps, userRoleEnum } from "./common";
import { players } from "./team";

/**
 * Application accounts. Identity is the username (unique, case-insensitive) plus the player's
 * Riot ID on their profile; an account is created together with its player profile by an admin.
 * There is no email anywhere in the model: nothing is sent, nothing is stored.
 * Everyone signs in with username + password. An admin creates a player with a random
 * temporary password (and can issue a new one as a reset); the player must replace it at first
 * sign-in. Activation codes (activation_codes) are retired by migration 0008.
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
    /** Signed in with a temporary password an admin issued: a permanent one must be chosen before anything else. */
    mustChangePassword: boolean("must_change_password").notNull().default(false),
    /** When the temporary password stops working (only while mustChangePassword is set). */
    temporaryPasswordExpiresAt: timestamp("temporary_password_expires_at", { withTimezone: true }),
    /** Set when the player finished first-login setup (roles and pools); null until then, which keeps them on /welcome. */
    setupCompletedAt: timestamp("setup_completed_at", { withTimezone: true }),
    /** Partial first-login setup, saved as the player goes so a refresh or a closed tab resumes where they were. */
    setupProgress: jsonb("setup_progress").$type<SetupProgress | null>(),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    /** Permission preset (null = the default preset, Standard Player). Ignored for owners. */
    permissionPresetId: uuid("permission_preset_id").references(() => permissionPresets.id, { onDelete: "set null" }),
    /** A custom capability list chosen for this user; when set it replaces the preset. Ignored for owners. */
    customCapabilities: jsonb("custom_capabilities").$type<string[] | null>(),
    /**
     * Additional access groups on top of the base level (e.g. "lineup-manager"): a player keeps
     * their normal access and also gets the group's few capabilities. Never Owner-only ones.
     */
    accessGroups: jsonb("access_groups").$type<string[]>().notNull().default([]),
    /**
     * Administrator: may open Admin Mode (accounts, permissions, platform settings, data, system
     * health, audit logs) on top of their normal player access, without a second account. Granted
     * and revoked only by another administrator (Admin → Users & Permissions); the Owner is always
     * one, whatever this says. Migration 0053 adds it false for everyone.
     */
    isAdmin: boolean("is_admin").notNull().default(false),
    /** Bumped whenever the profile picture changes, so its URL changes and browsers can cache it forever. Null = no picture. */
    avatarVersion: integer("avatar_version"),
    ...timestamps,
  },
  (t) => [uniqueIndex("users_username_lower_idx").on(sql`lower(${t.username})`), uniqueIndex("users_player_idx").on(t.playerId)],
);

export interface SetupProgress {
  displayName?: string | null;
  primaryRole?: string | null;
  primaryPool?: string[];
  secondaryRole?: string | null;
  secondaryPool?: string[];
}

/** Retired by migration 0008 (the short-lived passwordless sign-in); kept for history and rollback compatibility. Nothing issues or accepts codes. */
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
 * Failed sign-in attempts, for throttling (server/auth/throttle.ts). Every server instance reads
 * the same rows, so the limit holds however many instances the host runs. `key_hash` is a SHA-256
 * hash of what is throttled (a username with an address, or an address alone): no username or IP
 * address is stored. Rows older than the 15-minute window are deleted as new failures arrive.
 */
export const authFailures = pgTable(
  "auth_failures",
  {
    id: serial("id").primaryKey(),
    keyHash: text("key_hash").notNull(),
    at: timestamp("at", { withTimezone: true }).notNull(),
  },
  (t) => [index("auth_failures_key_at_idx").on(t.keyHash, t.at), index("auth_failures_at_idx").on(t.at)],
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

/**
 * Reusable capability sets for players (Admin Mode → Users & Permissions). Exactly one preset is the
 * default (Standard Player), used for every player without a preset or a custom set. Owners are
 * never limited by presets.
 */
export const permissionPresets = pgTable(
  "permission_presets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    capabilities: jsonb("capabilities").$type<string[]>().notNull(),
    isDefault: boolean("is_default").notNull().default(false),
    /**
     * Built-in access level this preset implements: "standard" (the default), "restricted" or
     * "administrator" (migration 0014). Null for presets an owner created; those stay selectable.
     */
    levelKey: text("level_key"),
    ...timestamps,
  },
  (t) => [uniqueIndex("permission_presets_name_lower_idx").on(sql`lower(${t.name})`), uniqueIndex("permission_presets_level_key_idx").on(t.levelKey).where(sql`${t.levelKey} IS NOT NULL`)],
);

/** Optional profile pictures: small square images (resized in the browser, validated on the server). */
export const userAvatars = pgTable("user_avatars", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  contentType: text("content_type").notNull(),
  data: bytea("data").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
