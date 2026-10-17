"use server";

import { getAppDb } from "@/server/bootstrap";
import { forgetFromJar, JarError, switchJar } from "@/server/auth/account-jar";
import { readJarState, writeJarState } from "@/server/auth/browser-accounts";
import { getSession } from "@/server/auth/session";

type Result = { ok: true } | { ok: false; error: string };

/**
 * Makes another account this browser is signed in to the active one (the account menu). Only a
 * remembered, still-valid session of that account qualifies: there is no switching to an account
 * without its own sign-in. The page then reloads in full, so nothing of the previous account's
 * pages, caches or client state carries over.
 */
export async function switchAccountAction(userId: string): Promise<Result> {
  try {
    const db = await getAppDb();
    if (!(await getSession())) return { ok: false, error: "Please sign in." };
    const next = await switchJar(db, await readJarState(), userId);
    await writeJarState(next, userId);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof JarError ? err.message : "Could not switch accounts. Please try again." };
  }
}

/** Signs a remembered account out of this browser (its session ends on the server). */
export async function forgetAccountAction(userId: string): Promise<Result> {
  try {
    const db = await getAppDb();
    const session = await getSession();
    if (!session) return { ok: false, error: "Please sign in." };
    const next = await forgetFromJar(db, await readJarState(), userId);
    await writeJarState(next, session.userId ?? null);
    return { ok: true };
  } catch {
    return { ok: false, error: "Could not remove that account. Please try again." };
  }
}
