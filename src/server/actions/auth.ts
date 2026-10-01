"use server";

import { redirect } from "next/navigation";
import { getAppDb } from "@/server/bootstrap";
import { clearSessionCookie, getAuthState, isProductionDeployment, sessionFromUser, setSessionCookie } from "@/server/auth/session";
import { validatePasswordStrength } from "@/server/auth/password";
import { acceptInvite, acceptInviteAsExistingUser, authenticate, countUsers, createUser, getValidInvite, UserError } from "@/server/repositories/users";

export type FormState = { error: string } | undefined;

function safeNext(next: string | null | undefined): string {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/team";
}

export async function loginAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const next = safeNext(String(formData.get("next") ?? ""));
  const db = await getAppDb();
  const user = await authenticate(db, email, password);
  if (!user) {
    await new Promise((r) => setTimeout(r, 400));
    return { error: "Email or password not recognised." };
  }
  await setSessionCookie(sessionFromUser({ id: user.id, role: user.role, displayName: user.displayName, playerId: user.playerId, email: user.email }));
  redirect(next);
}

/** First-run owner creation. In production the bootstrap key (UNIIVERSE_ACCESS_PASSWORD) is required. */
export async function setupOwnerAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const db = await getAppDb();
  if ((await countUsers(db)) > 0) return { error: "An owner account already exists. Sign in instead." };
  const bootstrap = process.env.UNIIVERSE_ACCESS_PASSWORD;
  if (isProductionDeployment() && bootstrap && String(formData.get("setupKey") ?? "") !== bootstrap) {
    await new Promise((r) => setTimeout(r, 400));
    return { error: "The setup key does not match UNIIVERSE_ACCESS_PASSWORD." };
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
