"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAppDb } from "@/server/bootstrap";
import { blockedFor, clearFailures, recordFailure, throttleKey } from "@/server/auth/throttle";
import { clearSessionCookie, getAuthState, isProductionDeployment, sessionFromUser, setSessionCookie } from "@/server/auth/session";
import { validatePasswordStrength } from "@/server/auth/password";
import { acceptInvite, acceptInviteAsExistingUser, authenticate, countUsers, createUser, getValidInvite, UserError } from "@/server/repositories/users";

export type FormState = { error: string } | undefined;

function safeNext(next: string | null | undefined): string {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/team";
}

async function clientIp(): Promise<string | null> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null;
}

export async function loginAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const next = safeNext(String(formData.get("next") ?? ""));
  const key = throttleKey(email, await clientIp());
  const wait = blockedFor(key);
  if (wait > 0) return { error: `Too many failed attempts. Try again in ${Math.ceil(wait / 60)} minute${wait > 60 ? "s" : ""}.` };
  const db = await getAppDb();
  const user = await authenticate(db, email, password);
  if (!user) {
    recordFailure(key);
    await new Promise((r) => setTimeout(r, 400));
    return { error: "Email or password not recognised." };
  }
  clearFailures(key);
  await setSessionCookie(sessionFromUser({ id: user.id, role: user.role, displayName: user.displayName, playerId: user.playerId, email: user.email }));
  redirect(next);
}

/**
 * First-run owner creation. In production the setup key (UNIIVERSE_ACCESS_PASSWORD) is required:
 * without it, whoever reached the fresh deployment first could claim it.
 */
export async function setupOwnerAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const db = await getAppDb();
  if ((await countUsers(db)) > 0) return { error: "An owner account already exists. Sign in instead." };
  const bootstrap = process.env.UNIIVERSE_ACCESS_PASSWORD;
  if (isProductionDeployment()) {
    if (!bootstrap) return { error: "Set UNIIVERSE_ACCESS_PASSWORD in the hosting environment and redeploy before creating the owner account." };
    const key = throttleKey("setup", await clientIp());
    const wait = blockedFor(key);
    if (wait > 0) return { error: `Too many failed attempts. Try again in ${Math.ceil(wait / 60)} minute${wait > 60 ? "s" : ""}.` };
    if (String(formData.get("setupKey") ?? "") !== bootstrap) {
      recordFailure(key);
      await new Promise((r) => setTimeout(r, 400));
      return { error: "The setup key does not match UNIIVERSE_ACCESS_PASSWORD." };
    }
  }
  const password = String(formData.get("password") ?? "");
  const weak = validatePasswordStrength(password);
  if (weak) return { error: weak };
  try {
    const user = await createUser(db, { email: String(formData.get("email") ?? ""), displayName: String(formData.get("displayName") ?? ""), password, role: "owner" });
    await setSessionCookie(sessionFromUser({ id: user.id, role: user.role, displayName: user.displayName, playerId: user.playerId, email: user.email }));
  } catch (err) {
    return { error: err instanceof UserError ? err.message : (err as Error).message };
  }
  redirect("/team");
}

export async function acceptInviteAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const token = String(formData.get("token") ?? "");
  const db = await getAppDb();
  const invite = await getValidInvite(db, token);
  if (!invite) return { error: "This invite link is invalid, used or expired." };
  const { session } = await getAuthState(db);
  try {
    if (session?.userId && String(formData.get("mode") ?? "") === "existing") {
      await acceptInviteAsExistingUser(db, token, session.userId);
      const { getUser } = await import("@/server/repositories/users");
      const user = (await getUser(db, session.userId))!;
      await setSessionCookie(sessionFromUser({ id: user.id, role: user.role, displayName: user.displayName, playerId: user.playerId, email: user.email }));
    } else {
      const password = String(formData.get("password") ?? "");
      const weak = validatePasswordStrength(password);
      if (weak) return { error: weak };
      const user = await acceptInvite(db, token, { email: String(formData.get("email") ?? ""), displayName: String(formData.get("displayName") ?? ""), password });
      await setSessionCookie(sessionFromUser({ id: user.id, role: user.role, displayName: user.displayName, playerId: user.playerId, email: user.email }));
    }
  } catch (err) {
    return { error: err instanceof UserError ? err.message : (err as Error).message };
  }
  redirect(invite.playerId ? "/me" : "/team");
}

export async function logoutAction(): Promise<void> {
  await clearSessionCookie();
  redirect("/login");
}
