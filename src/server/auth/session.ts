import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import type { Db } from "@/server/db/types";
import { countUsers, findUserByEmail, getUser } from "@/server/repositories/users";
import { randomToken } from "./password";
import { missingProductionSetup as missingProductionSetupFromEnv, requiresAccounts, sessionSecretValue } from "./mode";
import { canEdit as canEditPerm, hasPermission, isOwner as isOwnerPerm, type AccessRole, type Permission, type Session } from "./permissions";

export type { AccessRole, Session } from "./permissions";
export { hasPermission, canEditPlayer, ROLE_LABELS_USER } from "./permissions";

/**
 * Authentication.
 *
 * Every teammate has their own account (email + password) with a role: owner, coach or player.
 * Accounts are created through invite links; an invite can be bound to an existing player
 * profile so the teammate claims it rather than creating a duplicate. Sessions are signed JWT
 * cookies.
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
const SESSION_DAYS = 30;
const LOCAL_OWNER_EMAIL = "owner@uniiverse.local";

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

export async function createSessionToken(session: Session): Promise<string> {
  return new SignJWT({ role: session.role, label: session.label, pid: session.playerId, email: session.email })
    .setSubject(session.userId ?? "local")
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(secret());
}

export async function verifySessionToken(token: string): Promise<Session | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    const role = payload.role;
    if (role !== "owner" && role !== "coach" && role !== "player") return null;
    return {
      userId: payload.sub && payload.sub !== "local" ? payload.sub : null,
      role,
      label: typeof payload.label === "string" ? payload.label : role,
      playerId: typeof payload.pid === "string" ? payload.pid : null,
      email: typeof payload.email === "string" ? payload.email : null,
    };
  } catch {
    return null;
  }
}

export async function setSessionCookie(session: Session): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, await createSessionToken(session), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * SESSION_DAYS,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
}

export function sessionFromUser(user: { id: string; role: AccessRole; displayName: string; playerId: string | null; email: string }): Session {
  return { userId: user.id, role: user.role, label: user.displayName, playerId: user.playerId, email: user.email };
}

export interface AuthState {
  mode: AuthMode;
  session: Session | null;
}

/**
 * Resolves the auth mode and the current session. Needs the database to know whether any
 * accounts exist yet. Sessions are re-validated against the users table so role changes and
 * deactivation take effect immediately.
 */
export async function getAuthState(db: Db): Promise<AuthState> {
  if (missingProductionSetup().length > 0) return { mode: "locked", session: null };
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  const fromCookie = token ? await verifySessionToken(token) : null;
  if (fromCookie?.userId) {
    const user = await getUser(db, fromCookie.userId);
    if (user && user.isActive) return { mode: "accounts", session: sessionFromUser({ id: user.id, role: user.role, displayName: user.displayName, playerId: user.playerId, email: user.email }) };
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
  const existing = await findUserByEmail(db, LOCAL_OWNER_EMAIL);
  if (existing) return sessionFromUser({ id: existing.id, role: existing.role, displayName: "Local owner (no login configured)", playerId: existing.playerId, email: existing.email });
  const total = await countUsers(db);
  if (total > 0) return null;
  // Concurrent first requests may race here; the unique email index makes the insert idempotent.
  await createLocalOwnerIdempotent(db);
  const created = await findUserByEmail(db, LOCAL_OWNER_EMAIL);
  if (!created) return null;
  return sessionFromUser({ id: created.id, role: "owner", displayName: "Local owner (no login configured)", playerId: null, email: created.email });
}

async function createLocalOwnerIdempotent(db: Db): Promise<void> {
  const { users } = await import("@/server/db/schema");
  const { hashPassword } = await import("./password");
  await db
    .insert(users)
    .values({ email: LOCAL_OWNER_EMAIL, displayName: "Local owner", passwordHash: await hashPassword(randomToken(16)), role: "owner" })
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
