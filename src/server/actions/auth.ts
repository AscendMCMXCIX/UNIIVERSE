"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { kickoffAccountSync } from "@/server/accounts/kickoff";
import { getAppDb } from "@/server/bootstrap";
import { blockedFor, clearFailures, recordFailure, throttleKey } from "@/server/auth/throttle";
import { getAuthState, isProductionDeployment, signIn, signOut } from "@/server/auth/session";
import { validatePasswordStrength } from "@/server/auth/password";
import { defaultPlatform, registerAccount, type RiotIdInput } from "@/server/auth/signup";
import { acceptInviteAsExistingUser, authenticate, countUsers, getUser, getValidInvite, UserError } from "@/server/repositories/users";
import { ROLES, type Role } from "@/domain/roles";

export type FormState = { error: string; values?: Record<string, string> } | undefined;

/** Echo non-secret fields back so the form can restore them after an error. */
function keep(formData: FormData, ...names: string[]): Record<string, string> {
  return Object.fromEntries(names.map((n) => [n, String(formData.get(n) ?? "")]));
}

function safeNext(next: string | null | undefined): string {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/team";
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

export async function loginAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const username = String(formData.get("username") ?? "");
  const password = String(formData.get("password") ?? "");
  const remember = formData.get("remember") === "on" || formData.get("remember") === "true";
  const next = safeNext(String(formData.get("next") ?? ""));
  const key = throttleKey(username, await clientIp());
  const wait = blockedFor(key);
  if (wait > 0) return { error: `Too many failed attempts. Try again in ${Math.ceil(wait / 60)} minute${wait > 60 ? "s" : ""}.`, values: keep(formData, "username") };
  const db = await getAppDb();
  const user = await authenticate(db, username, password);
  if (!user) {
    recordFailure(key);
    await new Promise((r) => setTimeout(r, 400));
    return { error: "Username or password not recognised. Accounts created without a password can only sign in once the owner sets one.", values: keep(formData, "username") };
  }
  clearFailures(key);
  await signIn(db, user, { remember });
  redirect(next);
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
    const wait = blockedFor(key);
    if (wait > 0) return { error: `Too many failed attempts. Try again in ${Math.ceil(wait / 60)} minute${wait > 60 ? "s" : ""}.`, values };
    if (String(formData.get("setupKey") ?? "") !== bootstrap) {
      recordFailure(key);
      await new Promise((r) => setTimeout(r, 400));
      return { error: "The setup key does not match UNIIVERSE_ACCESS_PASSWORD.", values };
    }
  }
  const weak = validatePasswordStrength(signup.password);
  if (weak) return { error: `The owner account needs a password. ${weak}`, values };
  try {
    const user = await registerAccount(db, { username: signup.username, password: signup.password, role: "owner", primaryRiot: signup.primaryRiot, extraRiot: signup.extraRiot, primaryRole: signup.primaryRole, secondaryRole: signup.secondaryRole });
    await signIn(db, user, { remember: true });
    // Verify the Riot accounts right after the response; Riot being down never blocks sign-up.
    if (user.playerId) after(() => kickoffAccountSync(db, user.playerId!));
  } catch (err) {
    return { error: err instanceof UserError ? err.message : (err as Error).message, values };
  }
  redirect("/team");
}

/** Invite acceptance: creates account + player profile + Riot accounts in one step. */
export async function acceptInviteAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const token = String(formData.get("token") ?? "");
  const signup = readSignup(formData);
  const values = signup.values;
  const db = await getAppDb();
  const invite = await getValidInvite(db, token);
  if (!invite) return { error: "This invite link is invalid, used or expired.", values };
  const { session } = await getAuthState(db);
  try {
    if (session?.userId && String(formData.get("mode") ?? "") === "existing") {
      await acceptInviteAsExistingUser(db, token, session.userId);
      const user = (await getUser(db, session.userId))!;
      await signIn(db, user, { remember: true });
    } else {
      const user = await registerAccount(db, { username: signup.username, password: signup.password, role: invite.role, primaryRiot: signup.primaryRiot, extraRiot: signup.extraRiot, primaryRole: signup.primaryRole, secondaryRole: signup.secondaryRole, inviteToken: token });
      await signIn(db, user, { remember: true });
      if (user.playerId) after(() => kickoffAccountSync(db, user.playerId!));
    }
  } catch (err) {
    return { error: err instanceof UserError ? err.message : (err as Error).message, values };
  }
  redirect("/me");
}

export async function logoutAction(): Promise<void> {
  await signOut(await getAppDb());
  redirect("/login");
}
