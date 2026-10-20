"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { kickoffAccountSync } from "@/server/accounts/kickoff";
import { getAppDb } from "@/server/bootstrap";
import { blockedFor, clearFailures, recordFailure, throttleKey } from "@/server/auth/throttle";
import { isProductionDeployment, requireSessionForSetup, SESSION_COOKIE, signIn, signOut } from "@/server/auth/session";
import { revokeOtherSessions } from "@/server/auth/sessions";
import { cookies } from "next/headers";
import { verifyPassword } from "@/server/auth/password";
import { users as usersTable } from "@/server/db/schema";
import { eq } from "drizzle-orm";
import { completeSetup, saveSetupProgress } from "@/server/auth/onboarding";
import { validatePasswordStrength } from "@/server/auth/password";
import { defaultPlatform, registerAccount, type RiotIdInput } from "@/server/auth/signup";
import { authenticate, countUsers, setPassword, UserError } from "@/server/repositories/users";
import { ROLES, type Role } from "@/domain/roles";
import { explainLoginFailure, verifySetupKey } from "@/server/auth/recovery";
import { recordAudit } from "@/server/audit/log";
import { applyAdd, JarError, planAdd } from "@/server/auth/account-jar";
import { readJarState, writeJarState } from "@/server/auth/browser-accounts";

export type FormState = { error: string; values?: Record<string, string> } | undefined;
/** Sign-in answers with an error, or (after adding another account) where to load the app. */
export type LoginState = FormState | { error?: undefined; values?: undefined; switchTo: string };

/** Echo non-secret fields back so the form can restore them after an error. */
function keep(formData: FormData, ...names: string[]): Record<string, string> {
  return Object.fromEntries(names.map((n) => [n, String(formData.get(n) ?? "")]));
}

function safeNext(next: string | null | undefined): string {
  // No page asked for: "/" sends each account to its own start page (see app/page.tsx).
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

async function clientIp(): Promise<string | null> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null;
}

const SIGNUP_FIELDS = ["username", "riotId", "platform", "primaryRole", "secondaryRole", "extraRiotIds", "extraPlatforms"];

/** Reads the shared sign-up fields (username, Riot accounts, roles) from a form. */
function readSignup(formData: FormData) {
  const extraIds = formData.getAll("extraRiotId").map(String);
  const extraPlatforms = formData.getAll("extraPlatform").map(String);
  const extraRiot: RiotIdInput[] = extraIds.map((riotId, i) => ({ riotId, platform: extraPlatforms[i] || String(formData.get("platform") ?? defaultPlatform()) }));
  const secondary = String(formData.get("secondaryRole") ?? "");
  return {
    username: String(formData.get("username") ?? ""),
    password: String(formData.get("password") ?? ""),
    primaryRiot: { riotId: String(formData.get("riotId") ?? ""), platform: String(formData.get("platform") ?? defaultPlatform()) },
    extraRiot,
    primaryRole: String(formData.get("primaryRole") ?? "") as Role,
    secondaryRole: (ROLES as readonly string[]).includes(secondary) ? (secondary as Role) : null,
    values: { ...keep(formData, ...SIGNUP_FIELDS), extraRiotIds: extraIds.join("\n"), extraPlatforms: extraPlatforms.join("\n") },
  };
}

/**
 * Username + password for everyone. A username alone never signs anyone in. Failures are
 * throttled per username and per address and answer with one generic message. A temporary
 * password (new account or admin reset) opens /welcome, where a permanent one must be chosen.
 */
export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const username = String(formData.get("username") ?? "");
  const password = String(formData.get("password") ?? formData.get("secret") ?? "");
  const next = safeNext(String(formData.get("next") ?? ""));
  const adding = formData.get("add") === "1";
  const ip = await clientIp();
  const keys = [throttleKey(username, ip), throttleKey("*", ip)];
  const db = await getAppDb();
  const wait = Math.max(...(await Promise.all(keys.map((k) => blockedFor(db, k)))));
  if (wait > 0) return { error: `Too many failed attempts. Try again in ${Math.ceil(wait / 60)} minute${wait > 60 ? "s" : ""}.`, values: keep(formData, "username") };
  if (!username.trim() || !password) return { error: "Enter your username and your password.", values: keep(formData, "username") };
  const user = await authenticate(db, username, password);
  if (!user) {
    await recordFailure(db, keys);
    await new Promise((r) => setTimeout(r, 400));
    return { error: explainLoginFailure(username), values: keep(formData, "username") };
  }
  await clearFailures(db, keys[0]!);
  const target = user.mustChangePassword || (!user.setupCompletedAt && user.playerId) ? "/welcome" : next;
  if (adding) {
    // Add another account: the active one stays signed in and is remembered by this browser.
    const state = await readJarState();
    let plan: Awaited<ReturnType<typeof planAdd>>;
    try {
      plan = await planAdd(db, state, user.id);
    } catch (err) {
      return { error: err instanceof JarError ? err.message : "Could not add the account.", values: keep(formData, "username") };
    }
    const token = await signIn(db, user);
    await writeJarState(await applyAdd(db, plan, token), user.id);
    // A full page load (see LoginForm), so nothing of the other account's pages stays in memory.
    return { switchTo: target };
  }
  await signIn(db, user);
  redirect(target);
}

/**
 * First-run owner creation: username, Riot ID, main role and a password (the owner's account
 * administers everything, so it always has one). In production the setup key
 * (UNIIVERSE_ACCESS_PASSWORD) is required: without it, whoever reached the fresh deployment
 * first could claim it.
 */
export async function setupOwnerAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const signup = readSignup(formData);
  const values = signup.values;
  const db = await getAppDb();
  if ((await countUsers(db)) > 0) return { error: "An owner account already exists. Sign in instead.", values };
  const bootstrap = process.env.UNIIVERSE_ACCESS_PASSWORD;
  if (isProductionDeployment()) {
    if (!bootstrap) return { error: "Set UNIIVERSE_ACCESS_PASSWORD in the hosting environment and redeploy before creating the owner account.", values };
    const key = throttleKey("setup", await clientIp());
    const wait = await blockedFor(db, key);
    if (wait > 0) return { error: `Too many failed attempts. Try again in ${Math.ceil(wait / 60)} minute${wait > 60 ? "s" : ""}.`, values };
    if (!verifySetupKey(String(formData.get("setupKey") ?? ""))) {
      await recordFailure(db, [key]);
      await new Promise((r) => setTimeout(r, 400));
      return { error: "The setup key does not match UNIIVERSE_ACCESS_PASSWORD.", values };
    }
  }
  const weak = validatePasswordStrength(signup.password);
  if (weak) return { error: `The owner account needs a password. ${weak}`, values };
  try {
    const user = await registerAccount(db, { username: signup.username, password: signup.password, role: "owner", primaryRiot: signup.primaryRiot, extraRiot: signup.extraRiot, primaryRole: signup.primaryRole, secondaryRole: signup.secondaryRole });
    await recordAudit(db, { userId: user.id, username: user.username }, { action: "owner.setup", target: { type: "user", id: user.id, name: user.username } });
    await signIn(db, user);
    // Verify the Riot accounts right after the response; Riot being down never blocks sign-up.
    if (user.playerId) after(() => kickoffAccountSync(db, user.playerId!));
  } catch (err) {
    return { error: err instanceof UserError ? err.message : (err as Error).message, values };
  }
  redirect("/");
}

/** Signs out of the active account: "/" is then another signed-in account's start page or, with none left, the public team page, where Sign in opens its window. */
export async function logoutAction(): Promise<void> {
  await signOut(await getAppDb());
  redirect("/");
}

type SetupInput = { displayName?: string | null; primaryRole?: string | null; primaryPool?: string[]; secondaryRole?: string | null; secondaryPool?: string[] };

/** Autosave for first-time setup: every change is kept, so a refresh or a closed tab resumes it. */
export async function saveSetupProgressAction(input: SetupInput): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const session = await requireSessionForSetup();
    if (!session.userId) return { ok: false, error: "Please sign in." };
    if (session.mustChangePassword) return { ok: false, error: "Choose your permanent password first." };
    await saveSetupProgress(await getAppDb(), session.userId, input);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof UserError ? err.message : "Could not save your progress. Check your connection." };
  }
}

/**
 * First sign-in with a temporary password: choose the permanent one (typed twice). The
 * temporary password stops working at once, other devices are signed out, this one stays.
 */
export async function setPermanentPasswordAction(input: { next: string; confirm: string }): Promise<{ ok: false; error: string } | undefined> {
  const db = await getAppDb();
  let goTo = "/welcome";
  try {
    const session = await requireSessionForSetup();
    if (!session.userId) return { ok: false, error: "Please sign in." };
    if (!session.mustChangePassword) return { ok: false, error: "Your password is already set. Change it under Settings." };
    if (input.next !== input.confirm) return { ok: false, error: "The two passwords do not match." };
    const weak = validatePasswordStrength(input.next);
    if (weak) return { ok: false, error: weak };
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, session.userId));
    if (!user) return { ok: false, error: "Account not found." };
    if (user.passwordHash && (await verifyPassword(input.next, user.passwordHash))) return { ok: false, error: "Choose your own password, not the temporary one." };
    await setPassword(db, user.id, input.next, { keepSessions: true });
    await revokeOtherSessions(db, user.id, (await cookies()).get(SESSION_COOKIE)?.value);
    goTo = !user.setupCompletedAt && user.playerId ? "/welcome" : "/";
  } catch (err) {
    return { ok: false, error: err instanceof UserError || (err as Error).name === "NotAuthorizedError" ? (err as Error).message : "Could not save your password. Please try again." };
  }
  redirect(goTo);
}

/** Finishes the required first-time setup (validated on the server); the optional Personalise step follows. */
export async function finishSetupAction(input: SetupInput): Promise<{ ok: false; error: string } | undefined> {
  const db = await getAppDb();
  try {
    const session = await requireSessionForSetup();
    if (!session.userId) return { ok: false, error: "Please sign in." };
    if (session.mustChangePassword) return { ok: false, error: "Choose your permanent password first." };
    const user = await completeSetup(db, session.userId, input);
    if (user.playerId) after(() => kickoffAccountSync(db, user.playerId!));
  } catch (err) {
    return { ok: false, error: err instanceof UserError || (err as Error).name === "NotAuthorizedError" ? (err as Error).message : "Could not save your setup. Please try again." };
  }
  // The required part is done: the optional Personalise step (card and picture) is next.
  redirect("/welcome/personalise");
}
