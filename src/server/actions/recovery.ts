"use server";

import { publicErrorMessage } from "@/server/errors";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAppDb } from "@/server/bootstrap";
import { claimAttempt, clearFailures, throttleKey } from "@/server/auth/throttle";
import { getAuthState, signIn } from "@/server/auth/session";
import { listOwnerAccounts, recoverOwnerAccount, setupKeyConfigured, verifySetupKey } from "@/server/auth/recovery";
import { UserError } from "@/server/repositories/users";
import { recordAudit } from "@/server/audit/log";

export interface RecoveryOwnerView {
  id: string;
  username: string;
  displayName: string;
  hasPassword: boolean;
  hasPlayer: boolean;
  isActive: boolean;
}

export type RecoveryState = { step: "key" | "choose"; error?: string; owners?: RecoveryOwnerView[]; values?: Record<string, string> } | undefined;

async function clientIp(): Promise<string | null> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null;
}

/**
 * Two steps in one action: with a valid setup key, "reveal" lists the owner account(s); "recover"
 * applies the chosen username/password change and signs the owner in. The key is verified on
 * every call and throttled per address like the setup page.
 */
export async function recoveryAction(_prev: RecoveryState, formData: FormData): Promise<RecoveryState> {
  const setupKey = String(formData.get("setupKey") ?? "");
  const intent = String(formData.get("intent") ?? "reveal");
  const values = { username: String(formData.get("username") ?? ""), ownerId: String(formData.get("ownerId") ?? "") };
  if (!setupKeyConfigured()) return { step: "key", error: "Owner recovery needs the setup key. Add UNIIVERSE_ACCESS_PASSWORD in the hosting environment (on Vercel: Project → Settings → Environment Variables, Production), redeploy, then return here." };
  const key = throttleKey("owner-recovery", await clientIp());
  const db = await getAppDb();
  // Counted before the key is checked, so parallel attempts cannot all slip through.
  const attempt = await claimAttempt(db, [key]);
  if (attempt.wait > 0) return { step: "key", error: `Too many failed attempts. Try again in ${Math.ceil(attempt.wait / 60)} minute${attempt.wait > 60 ? "s" : ""}.` };
  if (!verifySetupKey(setupKey)) {
    await new Promise((r) => setTimeout(r, 400));
    return { step: "key", error: "The setup key does not match UNIIVERSE_ACCESS_PASSWORD." };
  }
  await attempt.withdraw();
  await clearFailures(db, key);
  const owners = (await listOwnerAccounts(db)).map((o) => ({ id: o.id, username: o.username, displayName: o.displayName, hasPassword: o.hasPassword, hasPlayer: o.hasPlayer, isActive: o.isActive }));
  if (owners.length === 0) return { step: "key", error: "There is no owner account in this database. If accounts were never created, use the setup page instead." };
  if (intent !== "recover") return { step: "choose", owners, values: { setupKey } };

  const ownerId = values.ownerId || (owners.length === 1 ? owners[0]!.id : "");
  if (!ownerId) return { step: "choose", owners, error: "Choose which owner account to recover.", values: { setupKey, ...values } };
  let destination: string;
  try {
    const user = await recoverOwnerAccount(db, { ownerId, username: values.username || null, password: String(formData.get("password") ?? "") || null });
    await recordAudit(db, { userId: user.id, username: user.username }, { action: "owner.recover", target: { type: "user", id: user.id, name: user.username }, details: { usernameChanged: !!values.username, passwordChanged: !!formData.get("password") } });
    await signIn(db, user);
    destination = user.playerId ? "/team" : "/me";
  } catch (err) {
    return { step: "choose", owners, error: err instanceof UserError ? err.message : publicErrorMessage(err), values: { setupKey, ...values } };
  }
  redirect(destination);
}

/** Whether the recovery page should be offered at all (production with accounts). */
export async function recoveryAvailable(): Promise<{ available: boolean; reason?: string }> {
  const db = await getAppDb();
  const auth = await getAuthState(db);
  if (auth.mode === "setup" || auth.mode === "locked") return { available: false, reason: "setup" };
  return { available: true };
}
