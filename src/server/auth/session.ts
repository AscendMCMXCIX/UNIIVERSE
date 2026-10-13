import { cache } from "react";
import { jwtVerify } from "jose";
import { cookies, headers } from "next/headers";
import type { Db } from "@/server/db/types";
import { countUsers, findUserByUsername, getUser, type UserRecord } from "@/server/repositories/users";
import { randomToken } from "./password";
import { missingProductionSetup as missingProductionSetupFromEnv, requiresAccounts, sessionSecretValue } from "./mode";
import { sessionCookieOptions } from "./config";
import { createSession, findSession, looksLikeSessionToken, revokeSession } from "./sessions";
import { canEdit as canEditPerm, hasPermission, isOwner as isOwnerPerm, type Permission, type Session } from "./permissions";

export type { AccessRole, Session } from "./permissions";
export { hasPermission, canEditPlayer, isDraftLead, describeAccess, ROLE_LABELS_USER } from "./permissions";

/**
 * Authentication.
 *
 * Every teammate has their own account (username, optional password) with a role: owner, coach
 * or player, created together with their player profile. Sessions live in the database
 * (auth/sessions.ts); the browser holds an opaque HTTP-only cookie. Cookies issued before the
 * sessions table existed are signed JWTs and stay valid until they expire.
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
const LOCAL_OWNER_USERNAME = "local-owner";

/** True when accounts are required (any Vercel deployment, or production with a real database). */
export function isProductionDeployment(): boolean {
  return requiresAccounts();
}

/** Production is only usable with a real database and a session secret. */
export function missingProductionSetup(): string[] {
  return missingProductionSetupFromEnv();
}

function secret(): Uint8Array {
  return new TextEncoder().encode(sessionSecretValue());
}

/** Legacy signed-JWT cookies (issued before server-side sessions). Verified, never issued. */
async function verifyLegacyToken(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    return payload.sub && payload.sub !== "local" ? payload.sub : null;
  } catch {
    return null;
  }
}

export function sessionFromUser(user: Pick<UserRecord, "id" | "role" | "draftLead" | "displayName" | "playerId" | "username" | "hasPassword">): Session {
  return { userId: user.id, role: user.role, draftLead: user.draftLead, label: user.displayName, playerId: user.playerId, username: user.username, hasPassword: user.hasPassword };
}

/** Starts a session for an authenticated user and sets the cookie. */
export async function signIn(db: Db, user: Pick<UserRecord, "id">, options: { remember?: boolean } = {}): Promise<void> {
  const remember = options.remember ?? false;
  const h = await headers();
  const { token } = await createSession(db, user.id, { remember, userAgent: h.get("user-agent") });
  const store = await cookies();
  store.set(SESSION_COOKIE, token, sessionCookieOptions(remember));
}

/** Ends the current session (server side and cookie). */
export async function signOut(db: Db): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) await revokeSession(db, token);
  store.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
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
  else if (token && token.includes(".")) userId = await verifyLegacyToken(token);
  if (userId) {
    const user = await getUser(db, userId);
    if (user && user.isActive) return { mode: "accounts", session: sessionFromUser(user) };
    return { mode: "accounts", session: null };
  }
  const total = await countUsers(db);
  if (isProductionDeployment()) {
    return { mode: total === 0 ? "setup" : "accounts", session: null };
  }
  // Local development: an automatic owner session until real accounts exist.
  const local = await ensureLocalOwner(db);
  if (local) return { mode: "open", session: local };
  return { mode: "accounts", session: null };
}

async function ensureLocalOwner(db: Db): Promise<Session | null> {
  // Local development only (never in production): a browser without a session cookie acts as
  // the automatic local owner, even once teammates have created real accounts locally.
  const existing = await findUserByUsername(db, LOCAL_OWNER_USERNAME);
  if (existing) return { userId: existing.id, role: existing.role, draftLead: existing.draftLead, label: "Local owner (no login configured)", playerId: existing.playerId, username: existing.username, hasPassword: true };
  const total = await countUsers(db);
  if (total > 0) return null;
  // Concurrent first requests may race here; the unique username index makes the insert idempotent.
  await createLocalOwnerIdempotent(db);
  const created = await findUserByUsername(db, LOCAL_OWNER_USERNAME);
  if (!created) return null;
  return { userId: created.id, role: "owner", draftLead: false, label: "Local owner (no login configured)", playerId: null, username: created.username, hasPassword: true };
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

export function canEdit(session: Session | null): boolean {
  return canEditPerm(session);
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

export async function requirePermission(permission: Permission): Promise<Session> {
  const session = await getSession();
  if (!hasPermission(session, permission)) throw new NotAuthorizedError();
  return session!;
}

export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session) throw new NotAuthorizedError("Please sign in.");
  return session;
}

/** Backwards-compatible helpers used by existing actions. */
export async function requireEditor(): Promise<Session> {
  return requirePermission("control-draft");
}

export async function requireOwner(): Promise<Session> {
  const session = await getSession();
  if (!isOwner(session)) throw new NotAuthorizedError("Only the owner can do that.");
  return session!;
}

export async function requirePlayerEditor(playerId: string): Promise<Session> {
  const session = await getSession();
  const { canEditPlayer } = await import("./permissions");
  if (!canEditPlayer(session, playerId)) throw new NotAuthorizedError();
  return session!;
}

/** Sync-only mode check for places that cannot touch the database (kept for the proxy). */
export function authMode(): "open" | "password" | "locked" {
  if (missingProductionSetup().length > 0) return "locked";
  return isProductionDeployment() ? "password" : "open";
}
