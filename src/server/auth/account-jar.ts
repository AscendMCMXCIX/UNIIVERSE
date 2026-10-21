import { createHash } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { sessions, users } from "@/server/db/schema";
import { SESSION_MAX_AGE_MS } from "./config";
import { hashSessionToken, looksLikeSessionToken, revokeSession } from "./sessions";

/**
 * One account per browser. The browser holds one session (the `uniiverse_session` cookie); signing
 * in replaces it and signing out ends it on the server.
 *
 * `uniiverse_accounts` is what is left of switching between several accounts in one browser (the
 * account menu offered it until the owner's player and admin accounts became one again). Nothing
 * writes it any more: it is only read so that signing in or out also ends the sessions it still
 * names, and then cleared.
 *
 * `uniiverse_who` is not a credential: a short fingerprint of the active account (readable by
 * scripts) that lets a page rendered for one account notice, before it sends anything, that the
 * browser has since signed in as another (see AccountGuard).
 */
export const ACCOUNTS_COOKIE = "uniiverse_accounts";
export const IDENTITY_COOKIE = "uniiverse_who";
/** The most session tokens read from the old cookie (it never held more than three). */
const MAX_REMEMBERED = 3;

/** The session tokens in the old cookie's value: well-formed, unique, at most MAX_REMEMBERED. */
export function parseJar(value: string | null | undefined): string[] {
  if (!value) return [];
  const out: string[] = [];
  for (const raw of value.split(",")) {
    const token = raw.trim();
    if (looksLikeSessionToken(token) && !out.includes(token)) out.push(token);
    if (out.length === MAX_REMEMBERED) break;
  }
  return out;
}

/** The active account's fingerprint (not secret, not a credential: it identifies, never authorises). */
export function identityMarker(userId: string): string {
  return createHash("sha256").update(`uniiverse-who:${userId}`).digest("hex").slice(0, 16);
}

/** The browser's sessions: the active one and any the old cookie still names. */
export interface JarState {
  active: string | null;
  remembered: string[];
}

/** Ends every session this browser holds, on the server. */
export async function signOutOfAll(db: Db, state: JarState): Promise<void> {
  for (const token of [state.active, ...state.remembered]) if (token) await revokeSession(db, token);
}

/** The live account behind a session token (expired, past the 24-hour limit, signed out or deactivated: none). */
export async function sessionUser(db: Db, token: string | null | undefined, now: Date = new Date()): Promise<string | null> {
  if (!token || !looksLikeSessionToken(token)) return null;
  const [row] = await db
    .select({ userId: users.id })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.tokenHash, hashSessionToken(token)), gt(sessions.expiresAt, now), gt(sessions.createdAt, new Date(now.getTime() - SESSION_MAX_AGE_MS)), eq(users.isActive, true)));
  return row?.userId ?? null;
}
