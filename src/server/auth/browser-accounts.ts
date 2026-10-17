import { cookies } from "next/headers";
import type { Db } from "@/server/db/types";
import { avatarUrl } from "@/server/repositories/users";
import { describeAccess } from "./permissions";
import { sessionCookieOptions } from "./config";
import { ACCOUNTS_COOKIE, IDENTITY_COOKIE, identityMarker, parseJar, resolveJar, serializeJar, type JarState } from "./account-jar";

/** The session cookie's name (also exported by session.ts, which imports this module's helpers). */
const SESSION_COOKIE = "uniiverse_session";

/** A remembered account as the account menu and Settings show it (no token: those stay in the cookie). */
export interface OtherAccount {
  userId: string;
  name: string;
  avatarUrl: string | null;
  roleLabel: string;
}

/** The browser's accounts as the cookies hold them (the server validates them before any use). */
export async function readJarState(): Promise<JarState> {
  const store = await cookies();
  return { active: store.get(SESSION_COOKIE)?.value ?? null, remembered: parseJar(store.get(ACCOUNTS_COOKIE)?.value) };
}

/**
 * Writes the browser's accounts: the session cookie, the remembered accounts' cookie (both
 * HTTP-only, Secure in production, SameSite=Lax) and the active account's fingerprint.
 */
export async function writeJarState(state: JarState, activeUserId: string | null): Promise<void> {
  const store = await cookies();
  const options = sessionCookieOptions();
  if (state.active) store.set(SESSION_COOKIE, state.active, options);
  else store.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  const jar = serializeJar(state.remembered);
  if (jar) store.set(ACCOUNTS_COOKIE, jar, options);
  else store.set(ACCOUNTS_COOKIE, "", { path: "/", maxAge: 0 });
  writeIdentity(store, activeUserId);
}

type CookieStore = Awaited<ReturnType<typeof cookies>>;

/** The active account's fingerprint, readable by the page (see account-jar.ts); never a credential. */
export function writeIdentity(store: CookieStore, userId: string | null): void {
  if (userId) store.set(IDENTITY_COOKIE, identityMarker(userId), { ...sessionCookieOptions(), httpOnly: false });
  else store.set(IDENTITY_COOKIE, "", { path: "/", maxAge: 0 });
}

/**
 * The other accounts this browser is signed in to, for the account menu: only live sessions,
 * never the active account. One query, and none at all for a browser that remembers nothing.
 */
export async function listOtherAccounts(db: Db, activeUserId: string | null): Promise<OtherAccount[]> {
  const { remembered } = await readJarState();
  if (remembered.length === 0) return [];
  const live = await resolveJar(db, remembered);
  return live
    .filter((a) => a.userId !== activeUserId)
    .map((a) => ({ userId: a.userId, name: a.username || a.displayName, avatarUrl: avatarUrl(a.userId, a.avatarVersion), roleLabel: describeAccess({ role: a.role }) }));
}
