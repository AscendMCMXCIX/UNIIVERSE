import { createHash } from "node:crypto";
import { and, eq, gt, inArray } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { sessions, users } from "@/server/db/schema";
import { SESSION_MAX_AGE_MS } from "./config";
import { hashSessionToken, looksLikeSessionToken, revokeSession } from "./sessions";

/**
 * Several accounts in one browser (switching from the account menu).
 *
 * The browser has one active session (the `uniiverse_session` cookie) and may remember up to
 * MAX_REMEMBERED other accounts. A remembered account is another full session of the sessions
 * table: it was created by signing in to that account with its password, and it lives in a
 * second HTTP-only cookie (`uniiverse_accounts`) with the same attributes as the session cookie.
 * Nothing about sessions is readable by page scripts or kept in browser storage, and the server
 * checks every remembered session against the database whenever it reads them (expiry, the
 * 24-hour sign-in limit, sign-out elsewhere, password changes, deactivation). Switching swaps the
 * two cookies' tokens; accounts are never merged, and each request acts only as the active one.
 *
 * `uniiverse_who` is not a credential: a short fingerprint of the active account (readable by
 * scripts) that lets a page rendered for one account notice, before it sends anything, that the
 * browser has since switched to another (see AccountGuard).
 */
export const ACCOUNTS_COOKIE = "uniiverse_accounts";
export const IDENTITY_COOKIE = "uniiverse_who";
/** Other accounts one browser may remember, besides the active one. */
export const MAX_REMEMBERED = 3;

/** The remembered session tokens in a cookie value: well-formed, unique, at most MAX_REMEMBERED. */
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

export function serializeJar(tokens: string[]): string {
  return parseJar(tokens.join(",")).join(",");
}

/** The active account's fingerprint (not secret, not a credential: it identifies, never authorises). */
export function identityMarker(userId: string): string {
  return createHash("sha256").update(`uniiverse-who:${userId}`).digest("hex").slice(0, 16);
}

export interface RememberedAccount {
  token: string;
  userId: string;
  username: string;
  displayName: string;
  role: "owner" | "coach" | "player";
  avatarVersion: number | null;
}

/**
 * The live accounts behind remembered tokens, in the jar's order: one query; sessions that ended
 * (expired, past the 24-hour limit, signed out, user deactivated or removed) are left out.
 */
export async function resolveJar(db: Db, tokens: string[], now: Date = new Date()): Promise<RememberedAccount[]> {
  if (tokens.length === 0) return [];
  const byHash = new Map(tokens.map((t) => [hashSessionToken(t), t]));
  const rows = await db
    .select({ tokenHash: sessions.tokenHash, userId: users.id, username: users.username, displayName: users.displayName, role: users.role, avatarVersion: users.avatarVersion })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(inArray(sessions.tokenHash, [...byHash.keys()]), gt(sessions.expiresAt, now), gt(sessions.createdAt, new Date(now.getTime() - SESSION_MAX_AGE_MS)), eq(users.isActive, true)));
  const found = new Map(rows.map((r) => [r.tokenHash, r]));
  const out: RememberedAccount[] = [];
  for (const [hash, token] of byHash) {
    const r = found.get(hash);
    if (r && !out.some((a) => a.userId === r.userId)) out.push({ token, userId: r.userId, username: r.username, displayName: r.displayName, role: r.role, avatarVersion: r.avatarVersion ?? null });
  }
  return out;
}

/** The browser's accounts after one change: the active session token and the remembered ones. */
export interface JarState {
  active: string | null;
  remembered: string[];
}

export class JarError extends Error {}

/**
 * Switching to a remembered account: it becomes active and the account that was active is
 * remembered in its place. Refused when that account's session has ended.
 */
export async function switchJar(db: Db, state: JarState, userId: string, now: Date = new Date()): Promise<JarState> {
  const live = await resolveJar(db, state.remembered, now);
  const target = live.find((a) => a.userId === userId);
  if (!target) throw new JarError("That account is signed out on this browser (its session ended). Sign in to it again with Add another account.");
  const [current] = state.active ? await resolveJar(db, [state.active], now) : [];
  const others = live.filter((a) => a.userId !== userId && a.userId !== current?.userId).map((a) => a.token);
  return { active: target.token, remembered: (current ? [current.token, ...others] : others).slice(0, MAX_REMEMBERED) };
}

/**
 * Signing in to another account while one is active ("Add another account"), planned before any
 * session is created: the active account is remembered, the new session will become active, and
 * older sessions of the same new account on this browser are ended. Refused (nothing changes) when
 * the browser already remembers MAX_REMEMBERED other accounts.
 */
export async function planAdd(db: Db, state: JarState, newUserId: string, now: Date = new Date()): Promise<{ remembered: string[]; revoke: string[] }> {
  const live = await resolveJar(db, state.remembered, now);
  const [current] = state.active ? await resolveJar(db, [state.active], now) : [];
  const others = live.filter((a) => a.userId !== newUserId && a.userId !== current?.userId).map((a) => a.token);
  const remembered = current && current.userId !== newUserId ? [current.token, ...others] : others;
  if (remembered.length > MAX_REMEMBERED) throw new JarError(`This browser already remembers ${MAX_REMEMBERED} other accounts. Remove one in Settings first.`);
  const revoke = [...live.filter((a) => a.userId === newUserId), ...(current && current.userId === newUserId ? [current] : [])].map((a) => a.token);
  return { remembered, revoke };
}

/** Carries out a planned add once the new account's session exists. */
export async function applyAdd(db: Db, plan: { remembered: string[]; revoke: string[] }, newToken: string): Promise<JarState> {
  for (const token of plan.revoke) await revokeSession(db, token);
  return { active: newToken, remembered: plan.remembered };
}

/** Forgetting a remembered account: its session is ended on the server and the browser drops it. */
export async function forgetFromJar(db: Db, state: JarState, userId: string, now: Date = new Date()): Promise<JarState> {
  const live = await resolveJar(db, state.remembered, now);
  for (const a of live.filter((x) => x.userId === userId)) await revokeSession(db, a.token);
  return { active: state.active, remembered: live.filter((a) => a.userId !== userId).map((a) => a.token) };
}

/**
 * Signing out of the active account: its session ends, and the first remembered account that is
 * still signed in becomes active (none left: the browser is signed out).
 */
export async function signOutOfActive(db: Db, state: JarState, now: Date = new Date()): Promise<JarState> {
  if (state.active) await revokeSession(db, state.active);
  const live = await resolveJar(db, state.remembered, now);
  const [next, ...rest] = live;
  return { active: next?.token ?? null, remembered: rest.map((a) => a.token) };
}

/** Signing out of every account of this browser: every one of its sessions ends. */
export async function signOutOfAll(db: Db, state: JarState): Promise<JarState> {
  for (const token of [state.active, ...state.remembered]) if (token) await revokeSession(db, token);
  return { active: null, remembered: [] };
}

/** True when the session token belongs to this user and is live (used to keep `uniiverse_who` right). */
export async function sessionUser(db: Db, token: string | null | undefined, now: Date = new Date()): Promise<string | null> {
  if (!token || !looksLikeSessionToken(token)) return null;
  const [row] = await resolveJar(db, [token], now);
  return row?.userId ?? null;
}
