import { cache } from "react";
import { cookies, headers } from "next/headers";
import type { Db } from "@/server/db/types";
import { countUsers, findUserByUsername, getUser, type UserRecord } from "@/server/repositories/users";
import { randomToken } from "./password";
import { missingProductionSetup as missingProductionSetupFromEnv, requiresAccounts } from "./mode";
import { sessionCookieOptions } from "./config";
import { createSession, findSession, looksLikeSessionToken } from "./sessions";
import { sessionUser, signOutOfActive } from "./account-jar";
import { readJarState, writeIdentity, writeJarState } from "./browser-accounts";
import { hasPermission, isOwner as isOwnerPerm, type Permission, type Session } from "./permissions";

export type { AccessRole, Session } from "./permissions";
export { hasPermission, canEditPlayer, canControlDraft, isAdmin, describeAccess, ROLE_LABELS_USER } from "./permissions";

/**
 * Authentication.
 *
 * Every teammate has their own account, created by an admin together with their player profile,
 * and signs in with username + password. A new account (or an admin reset) gets a temporary
 * password that must be replaced at the next sign-in; until that and the first-time setup are
 * done, only /welcome is open: the app layout redirects there and requireSession /
 * requirePermission refuse every other action. Sessions live in the database
 * (auth/sessions.ts) and end 24 hours after sign-in; the browser holds an opaque HTTP-only
 * cookie. Signed-JWT cookies from before the sessions table are no longer accepted.
 *
 * Modes:
 *   - accounts: normal operation, login required.
 *   - setup:    production with no accounts yet → /setup creates the owner (guarded by the
 *               UNIIVERSE_ACCESS_PASSWORD bootstrap key).
 *   - locked:   production without a real database → /setup explains what to configure.
 *   - open:     local development with no real accounts → an automatic local owner session.
 */
export type AuthMode = "accounts" | "setup" | "locked" | "open";

export const SESSION_COOKIE = "uniiverse_session";
/** Local development only: browse as a visitor without an account instead of the automatic local owner. */
export const GUEST_COOKIE = "uniiverse_guest";
const LOCAL_OWNER_USERNAME = "local-owner";

/** True when accounts are required (any Vercel deployment, or production with a real database). */
export function isProductionDeployment(): boolean {
  return requiresAccounts();
}

/** Production is only usable with a real database and a session secret. */
export function missingProductionSetup(): string[] {
  return missingProductionSetupFromEnv();
}

export function sessionFromUser(user: Pick<UserRecord, "id" | "role" | "displayName" | "playerId" | "username" | "hasPassword" | "mustChangePassword" | "setupCompletedAt"> & Partial<Pick<UserRecord, "capabilities" | "avatarVersion" | "teamMember">>): Session {
  return { userId: user.id, role: user.role, label: user.displayName, playerId: user.playerId, username: user.username, hasPassword: user.hasPassword, mustChangePassword: user.mustChangePassword, setupComplete: user.setupCompletedAt !== null, capabilities: user.capabilities, avatarVersion: user.avatarVersion ?? null, teamMember: user.teamMember ?? true };
}

/**
 * Signed in but not ready for the app: a temporary password still to replace, or a player who
 * has not chosen roles and champion pools yet. Only /welcome is open to them.
 */
export function needsSetup(session: Session | null): boolean {
  return !!session && (session.mustChangePassword || (!session.setupComplete && !!session.playerId));
}

/** Starts a 24-hour session for an authenticated user and sets the cookie; returns its token. */
export async function signIn(db: Db, user: Pick<UserRecord, "id">): Promise<string> {
  const h = await headers();
  const { token } = await createSession(db, user.id, { userAgent: h.get("user-agent") });
  const store = await cookies();
  store.set(SESSION_COOKIE, token, sessionCookieOptions());
  writeIdentity(store, user.id);
  return token;
}

/**
 * Ends the current session (server side and cookie). Another account this browser is signed in
 * to (see account-jar.ts) becomes active; returns whether one did.
 */
export async function signOut(db: Db): Promise<boolean> {
  const next = await signOutOfActive(db, await readJarState());
  const userId = await sessionUser(db, next.active);
  await writeJarState(next, userId);
  return !!userId;
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  writeIdentity(store, null);
}

export interface AuthState {
  mode: AuthMode;
  session: Session | null;
}

/**
 * Resolves the auth mode and the current session. Sessions are re-validated against the
 * sessions and users tables so logout, role changes and deactivation take effect immediately.
 */
export const getAuthState = cache(async function getAuthState(db: Db): Promise<AuthState> {
  return resolveAuthState(db);
});

async function resolveAuthState(db: Db): Promise<AuthState> {
  if (missingProductionSetup().length > 0) return { mode: "locked", session: null };
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  let userId: string | null = null;
  if (token && looksLikeSessionToken(token)) userId = (await findSession(db, token))?.userId ?? null;
  if (userId) {
    const user = await getUser(db, userId);
    if (user && user.isActive) return { mode: "accounts", session: sessionFromUser(user) };
    return { mode: "accounts", session: null };
  }
  const total = await countUsers(db);
  if (isProductionDeployment()) {
    return { mode: total === 0 ? "setup" : "accounts", session: null };
  }
  // Local development: a browser holding the guest cookie is a visitor without an account (to
  // try the public pages). It can only take access away, so it needs no production guard.
  if (store.get(GUEST_COOKIE)?.value === "1") return { mode: "accounts", session: null };
  // Local development: an automatic owner session until real accounts exist.
  const local = await ensureLocalOwner(db);
  if (local) return { mode: "open", session: local };
  return { mode: "accounts", session: null };
}

async function ensureLocalOwner(db: Db): Promise<Session | null> {
  // Local development only (never in production): a browser without a session cookie acts as
  // the automatic local owner, even once teammates have created real accounts locally.
  const existing = await findUserByUsername(db, LOCAL_OWNER_USERNAME);
  if (existing) return { userId: existing.id, role: existing.role, label: "Local owner (no login configured)", playerId: existing.playerId, username: existing.username, hasPassword: true, mustChangePassword: false, setupComplete: true, avatarVersion: existing.avatarVersion ?? null, localDev: true };
  const total = await countUsers(db);
  if (total > 0) return null;
  // Concurrent first requests may race here; the unique username index makes the insert idempotent.
  await createLocalOwnerIdempotent(db);
  const created = await findUserByUsername(db, LOCAL_OWNER_USERNAME);
  if (!created) return null;
  return { userId: created.id, role: "owner", label: "Local owner (no login configured)", playerId: null, username: created.username, hasPassword: true, mustChangePassword: false, setupComplete: true, localDev: true };
}

/**
 * The local owner account, created now rather than on the first request. Demo data that adds
 * accounts of its own (members still in setup) calls it first, so local development stays open.
 */
export async function ensureLocalOwnerAccount(db: Db): Promise<void> {
  if (isProductionDeployment()) return;
  await createLocalOwnerIdempotent(db);
}

async function createLocalOwnerIdempotent(db: Db): Promise<void> {
  const { users } = await import("@/server/db/schema");
  const { hashPassword } = await import("./password");
  await db
    .insert(users)
    .values({ username: LOCAL_OWNER_USERNAME, displayName: "Local owner", passwordHash: await hashPassword(randomToken(16)), role: "owner" })
    .onConflictDoNothing();
}

export async function getSession(): Promise<Session | null> {
  const { getAppDb } = await import("@/server/bootstrap");
  const db = await getAppDb();
  return (await getAuthState(db)).session;
}

export function isOwner(session: Session | null): boolean {
  return isOwnerPerm(session);
}

export class NotAuthorizedError extends Error {
  constructor(message = "You do not have permission to do that.") {
    super(message);
    this.name = "NotAuthorizedError";
  }
}

const SETUP_FIRST = "Finish your first-time setup (roles and champion pools) first.";

/** Signed in and set up. Use for everything except the setup itself. */
export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session) throw new NotAuthorizedError("Please sign in.");
  if (needsSetup(session)) throw new NotAuthorizedError(SETUP_FIRST);
  return session;
}

/** Signed in, setup finished or not: only the first-time setup actions use this. */
export async function requireSessionForSetup(): Promise<Session> {
  const session = await getSession();
  if (!session) throw new NotAuthorizedError("Please sign in.");
  return session;
}

/** Signed in, set up, and in the team workspace (drafts, matches, series): personal-use accounts are refused. */
export async function requireTeamMember(): Promise<Session> {
  const session = await requireSession();
  const { isTeamMember } = await import("./permissions");
  if (!isTeamMember(session)) throw new NotAuthorizedError("That is part of the team workspace, which this account does not use.");
  return session;
}

export async function requirePermission(permission: Permission): Promise<Session> {
  const session = await requireSession();
  if (!hasPermission(session, permission)) throw new NotAuthorizedError();
  return session;
}

export async function requireOwner(): Promise<Session> {
  const session = await requireSession();
  if (!isOwner(session)) throw new NotAuthorizedError("Only an admin can do that.");
  return session;
}

/** Own Riot accounts (with the capability) or any player's as a player manager. */
export async function requireRiotAccountEditor(playerId: string): Promise<Session> {
  const session = await requireSession();
  const { canManageRiotAccounts } = await import("./permissions");
  if (!canManageRiotAccounts(session, playerId)) throw new NotAuthorizedError();
  return session;
}

export async function requirePlayerEditor(playerId: string): Promise<Session> {
  const session = await requireSession();
  const { canEditPlayer } = await import("./permissions");
  if (!canEditPlayer(session, playerId)) throw new NotAuthorizedError();
  return session;
}

/** Sync-only mode check for places that cannot touch the database (kept for the proxy). */
export function authMode(): "open" | "password" | "locked" {
  if (missingProductionSetup().length > 0) return "locked";
  return isProductionDeployment() ? "password" : "open";
}
