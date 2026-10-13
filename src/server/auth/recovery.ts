import { timingSafeEqual } from "node:crypto";
import type { Db } from "@/server/db/types";
import { getUser, listUsers, setPassword, updateUser, UserError, type UserRecord } from "@/server/repositories/users";
import { validatePasswordStrength } from "./password";

/**
 * Owner recovery.
 *
 * Login is username + password and nothing else: no email, no reset link. An owner who does
 * not know their username (accounts created before usernames existed were given their former
 * display name as username by migration 0002) or their password proves ownership with the
 * setup key instead: UNIIVERSE_ACCESS_PASSWORD, the secret only the deployment's owner holds in
 * the hosting environment. With it they can see the owner username, rename it and/or set a
 * new password, and are signed in. Nothing else about the account changes, no account is
 * created, and the key is compared in constant time behind the same throttle as the setup page.
 */
export type RecoveryEnv = Record<string, string | undefined>;

export function setupKeyConfigured(env: RecoveryEnv = process.env): boolean {
  return (env.UNIIVERSE_ACCESS_PASSWORD ?? "").trim().length > 0;
}

export function verifySetupKey(provided: string, env: RecoveryEnv = process.env): boolean {
  const expected = (env.UNIIVERSE_ACCESS_PASSWORD ?? "").trim();
  if (!expected) return false;
  const a = Buffer.from(provided.trim(), "utf8");
  const b = Buffer.from(expected, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

export interface OwnerAccountSummary {
  id: string;
  username: string;
  displayName: string;
  hasPassword: boolean;
  hasPlayer: boolean;
  isActive: boolean;
  lastLoginAt: Date | null;
}

/** Every owner account (active or not); there is normally exactly one. */
export async function listOwnerAccounts(db: Db): Promise<OwnerAccountSummary[]> {
  return (await listUsers(db)).filter((u) => u.role === "owner").map((u) => ({ id: u.id, username: u.username, displayName: u.displayName, hasPassword: u.hasPassword, hasPlayer: !!u.playerId, isActive: u.isActive, lastLoginAt: u.lastLoginAt }));
}

export interface RecoverOwnerInput {
  ownerId: string;
  /** New username; blank keeps the current one. */
  username?: string | null;
  /** New password; blank keeps the current one (required when the account has none). */
  password?: string | null;
}

/**
 * Applies the recovery: optional rename, optional new password, reactivation. The role, the
 * player profile and everything else stay as they are; the password hash is untouched unless a
 * new password is given.
 */
export async function recoverOwnerAccount(db: Db, input: RecoverOwnerInput): Promise<UserRecord> {
  const user = await getUser(db, input.ownerId);
  if (!user || user.role !== "owner") throw new UserError("Only owner accounts can be recovered this way.");
  const username = (input.username ?? "").trim();
  const password = input.password ?? "";
  if (!password && !user.hasPassword) throw new UserError("This owner account has no password yet; set one now to be able to sign in.");
  if (password) {
    const weak = validatePasswordStrength(password);
    if (weak) throw new UserError(weak);
  }
  const patch: Parameters<typeof updateUser>[2] = {};
  if (username && username.toLowerCase() !== user.username.toLowerCase()) patch.username = username;
  else if (username && username !== user.username) patch.username = username; // same letters, different case: keep the spelling the owner typed
  if (!user.isActive) patch.isActive = true;
  if (Object.keys(patch).length) await updateUser(db, user.id, patch);
  if (password) await setPassword(db, user.id, password);
  return (await getUser(db, user.id))!;
}

/**
 * Plain-language reason a login was refused, chosen from what was typed (never from whether the
 * account exists): an email-looking login gets told what the username is likely to be.
 */
export function explainLoginFailure(login: string): string {
  if (login.includes("@")) return "Sign in with your username, not an email address: UNIIVERSE has no email login. Accounts created before usernames existed use their former display name as the username. Owners who are unsure can use owner recovery (link below).";
  return "Username or password not recognised. Accounts created without a password can only sign in once the owner sets one. Owners who forgot their username or password can use owner recovery (link below).";
}
