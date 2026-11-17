import { createHmac } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { auditEvents, users } from "@/server/db/schema";
import { defineJob } from "./registry";
import { createUser, findUserByUsername, setPassword } from "@/server/repositories/users";
import { verifyPassword } from "@/server/auth/password";
import { revokeAllSessions } from "@/server/auth/sessions";
import { recordAudit } from "@/server/audit/log";
import { VERIFY_DISPLAY_NAME, VERIFY_USERNAME } from "@/server/auth/verification-account";

/*
  THE PRODUCTION VERIFICATION ACCOUNT (docs/LIVE_VALIDATION.md). The daily Production check signs in
  with it to open the member pages on the live site as a member sees them.

  It is an ordinary member account with no player profile: role "player", the default access
  level (no level of its own, no access group, no custom permissions), not an administrator,
  first-time setup marked done. With no profile it is in no list a member sees (Players, the
  lineup, leaderboards, statistics, insights: they all read player profiles), it has no Riot
  account, so nothing is collected for it, and it holds exactly the access a new member gets. It
  cannot give itself a profile (only the Owner completes one, actions/users.ts) or change its
  username, display name or password in Settings (server/auth/verification-account.ts). It signs in
  through the normal sign-in form, with its password checked like anyone's and the same throttling.

  Nobody types or keeps its password. It is derived from CRON_SECRET (an HMAC with a fixed label),
  which both this server and the Production check already hold, so each works it out on its own:
  it is never stored anywhere but as the account's password hash, and never printed (the workflow
  masks it). Whoever holds CRON_SECRET can therefore sign in as this member account, with the
  default member access and nothing more. A change of CRON_SECRET changes the password: the next
  run of this job follows it.

  `verify-account` (production only) runs before every Production check, and by hand from Data jobs.
  It creates the account, or changes nothing when its password is already the derived one, or
  updates the password after a CRON_SECRET change. When its own account (the derived password) has
  been changed, given more access, a level, a profile or another name, it withdraws the password and
  ends its sessions ("withdrawn"), so CRON_SECRET no longer opens it; until the change is undone,
  each run ends any session it still has, and then the next run sets the password again. An account
  of that name that is not the plain member it keeps, and whose password is not the derived one, it
  never touches: an active one answers "conflict", a deactivated one "deactivated". A deactivated
  account stays deactivated: deactivating it in Admin is how the owner turns the signed-in checks
  off. The Production check fails on withdrawn, conflict or no answer.
*/

export { VERIFY_DISPLAY_NAME, VERIFY_USERNAME };
const LABEL = "uniiverse:production-verification-account:v1";

/** The account's password, worked out from CRON_SECRET (base64url HMAC-SHA256; the workflow does the same with openssl). */
export function deriveVerifyPassword(cronSecret: string): string {
  return createHmac("sha256", cronSecret).update(LABEL, "utf8").digest("base64url");
}

export type VerifyAccountState = "created" | "unchanged" | "password-updated" | "deactivated" | "withdrawn" | "conflict";
const JOB = { userId: null, username: "verify-account job" } as const;

export async function ensureVerificationAccount(db: Db, env: Record<string, string | undefined> = process.env): Promise<{ ok: boolean; error?: string; summary: { username: string; state?: VerifyAccountState } }> {
  const secret = env.CRON_SECRET ?? "";
  if (env.VERCEL_ENV !== "production") return { ok: false, error: "Only the production deployment keeps the verification account (VERCEL_ENV is not production).", summary: { username: VERIFY_USERNAME } };
  if (secret.length < 16) return { ok: false, error: "CRON_SECRET is not set (or is too short) on this server.", summary: { username: VERIFY_USERNAME } };
  const password = deriveVerifyPassword(secret);
  const existing = await findUserByUsername(db, VERIFY_USERNAME);
  if (!existing) {
    const user = await createUser(db, { username: VERIFY_USERNAME, displayName: VERIFY_DISPLAY_NAME, password, role: "player", playerId: null });
    await recordAudit(db, JOB, { action: "account.create", target: { type: "user", id: user.id, name: VERIFY_USERNAME }, details: { purpose: "production verification", profile: false } });
    return { ok: true, summary: { username: VERIFY_USERNAME, state: "created" } };
  }
  // The plain member this job keeps: no profile, a player, not an administrator, the default level
  // (no level of its own, no custom set, no group) and its display name. Stored fields only, so an
  // edit of the default level, which every new member gets too, is not a change.
  const plain = !existing.playerId && existing.role === "player" && !existing.isAdmin && existing.permissionPresetId === null && existing.customCapabilities === null && (existing.accessGroups ?? []).length === 0 && existing.displayName === VERIFY_DISPLAY_NAME;
  const derived = !!existing.passwordHash && (await verifyPassword(password, existing.passwordHash));
  // Changed, yet its password is the derived one, so this job or a CRON_SECRET holder set it: the
  // job's own account, given more access, a level, a profile or another name. CRON_SECRET must not
  // open it any more: the password is withdrawn and every session ends. Once the change is undone
  // (or the account deleted), the next run sets the password again (or creates the account).
  if (!plain && derived) {
    await db.transaction(async (tx) => {
      await tx.update(users).set({ passwordHash: null, mustChangePassword: false, temporaryPasswordExpiresAt: null, updatedAt: new Date() }).where(eq(users.id, existing.id));
      await revokeAllSessions(tx, existing.id);
    });
    await recordAudit(db, JOB, { action: "account.password-withdrawn", target: { type: "user", id: existing.id, name: VERIFY_USERNAME }, details: { purpose: "production verification", reason: "access, profile or name changed" } });
    return { ok: false, error: `The account "${VERIFY_USERNAME}" no longer has only the default member access, or its profile or name changed; its password was withdrawn, so CRON_SECRET no longer opens it.`, summary: { username: VERIFY_USERNAME, state: "withdrawn" } };
  }
  // A sign-in that checked the derived password just before the withdrawal can create its session
  // just after it. So while the job's own withdrawn account (its audit record says so) is still
  // changed and has no password, every run ends its sessions again: such a session lasts until the
  // next run at most. Never for any other account of that name.
  if (!plain && !existing.passwordHash && (await withdrawnByThisJob(db, existing.id))) await revokeAllSessions(db, existing.id);
  // Deactivated is the owner's off switch, whatever else it is: nothing signs in to it.
  if (!existing.isActive) return { ok: true, summary: { username: VERIFY_USERNAME, state: "deactivated" } };
  if (!plain) return { ok: false, error: `An account named "${VERIFY_USERNAME}" exists that is not the plain member this job keeps, and its password is not the derived one; nothing was changed.`, summary: { username: VERIFY_USERNAME, state: "conflict" } };
  if (derived) return { ok: true, summary: { username: VERIFY_USERNAME, state: "unchanged" } };
  await setPassword(db, existing.id, password);
  await recordAudit(db, JOB, { action: "account.password-reset", target: { type: "user", id: existing.id, name: VERIFY_USERNAME }, details: { purpose: "production verification", reason: "derived again" } });
  return { ok: true, summary: { username: VERIFY_USERNAME, state: "password-updated" } };
}

/** This job withdrew this account's password before (Admin → Audit Logs). */
async function withdrawnByThisJob(db: Db, userId: string): Promise<boolean> {
  const [row] = await db.select({ id: auditEvents.id }).from(auditEvents).where(and(eq(auditEvents.action, "account.password-withdrawn"), eq(auditEvents.targetId, userId))).limit(1);
  return !!row;
}

defineJob({
  key: "verify-account",
  description: "Production only: keeps the member account the Production check signs in with (\"verify\"): no player profile, so it is in no list, statistic or leaderboard and nothing is collected from Riot for it; the default member access; its password worked out from CRON_SECRET, never stored or shown. Creates it, or changes nothing, or updates the password after a CRON_SECRET change; withdraws the password (and ends its sessions) if the account was given more access, a profile or another name.",
  defaultIntervalMinutes: null,
  run: async (ctx) => {
    const result = await ensureVerificationAccount(ctx.db);
    ctx.log(`verify-account: ${result.ok ? result.summary.state : result.error}`);
    return result;
  },
});
