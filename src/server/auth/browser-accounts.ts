import { cookies } from "next/headers";
import { ACCOUNTS_COOKIE, IDENTITY_COOKIE, identityMarker, parseJar, type JarState } from "./account-jar";
import { sessionCookieOptions } from "./config";

/** The session cookie's name (also exported by session.ts, which imports this module's helpers). */
const SESSION_COOKIE = "uniiverse_session";

/** The browser's sessions as its cookies hold them (the server validates them before any use). */
export async function readJarState(): Promise<JarState> {
  const store = await cookies();
  return { active: store.get(SESSION_COOKIE)?.value ?? null, remembered: parseJar(store.get(ACCOUNTS_COOKIE)?.value) };
}

type CookieStore = Awaited<ReturnType<typeof cookies>>;

/** Drops the old cookie of remembered accounts (see account-jar.ts), whose sessions have been ended. */
export function clearRemembered(store: CookieStore): void {
  if (store.get(ACCOUNTS_COOKIE)) store.set(ACCOUNTS_COOKIE, "", { path: "/", maxAge: 0 });
}

/** The active account's fingerprint, readable by the page (see account-jar.ts); never a credential. */
export function writeIdentity(store: CookieStore, userId: string | null): void {
  if (userId) store.set(IDENTITY_COOKIE, identityMarker(userId), { ...sessionCookieOptions(), httpOnly: false });
  else store.set(IDENTITY_COOKIE, "", { path: "/", maxAge: 0 });
}
