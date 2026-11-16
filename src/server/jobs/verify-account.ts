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

  Nobody types or keeps its password. It is derived (an HMAC with a fixed label) from a key that both
  this server and the Production check hold, so each works it out on its own: it is never stored
  anywhere but as the account's password hash, and never printed (the workflow masks it). The key is
  VERIFY_ACCOUNT_SECRET, a secret of its own, once the owner has set it (Vercel's Production
  environment and the repository's secrets, the same value); until then it is CRON_SECRET, the
  scheduler's secret, as it was from the start. Whoever holds the key can sign in as this member
  account, with the default member access and nothing more; with VERIFY_ACCOUNT_SECRET set, the
  scheduler's secret, which also lives in Supabase Vault and in every pg_cron call, no longer opens a
  member session, and each of the two can be replaced without the other. A change of the key
  (setting VERIFY_ACCOUNT_SECRET, or replacing whichever is in use) changes the password: the next
  run of this job follows it and ends the account's sessions. The job answers which key it used, by
  name, so the Production check derives the password from the same one. A VERIFY_ACCOUNT_SECRET the
  server cannot use is never a reason to fall back: the password CRON_SECRET gave is withdrawn
  until it is fixed.

  `verify-account` (production only) runs before every Production check, and by hand from Data jobs.
  It creates the account, or changes nothing when its password is already the derived one, or
  updates the password after a change of the key. When its own account (the derived password, or,
  just after VERIFY_ACCOUNT_SECRET was set, the one CRON_SECRET gave) has been changed, given more
  access, a level, a profile or another name, it withdraws the password and ends its sessions
  ("withdrawn"), so no key opens it; until the change is undone, each run ends any session it still
  has, and then the next run sets the password again. An account of
  that name that is not the plain member it keeps, and whose password is not the derived one, it
  never touches: an active one answers "conflict", a deactivated one "deactivated". A deactivated
  account stays deactivated: deactivating it in Admin is how the owner turns the signed-in checks
  off; the plain one's password still follows a change of the key. The Production check fails on
  withdrawn, conflict or no answer.
*/

export { VERIFY_DISPLAY_NAME, VERIFY_USERNAME };
const LABEL = "uniiverse:production-verification-account:v1";

/** The account's password, worked out from its key (base64url HMAC-SHA256; the workflow does the same with node). */
export function deriveVerifyPassword(key: string): string {
  return createHmac("sha256", key).update(LABEL, "utf8").digest("base64url");
}

/** Which secret the password is worked out from, by name (the job's answer names it, never its value). */
export type VerifyKeyName = "VERIFY_ACCOUNT_SECRET" | "CRON_SECRET";
/** The shortest VERIFY_ACCOUNT_SECRET accepted (`openssl rand -base64 48` gives 64 characters). */
export const VERIFY_SECRET_MIN_LENGTH = 32;

/** Said when VERIFY_ACCOUNT_SECRET cannot be used. The job's answer reaches public logs (Data jobs, the Production check's issue), so it names the rules, not which one failed. */
export const VERIFY_SECRET_UNUSABLE = `VERIFY_ACCOUNT_SECRET on this server cannot be used: it must be at least ${VERIFY_SECRET_MIN_LENGTH} characters, with no space or line break at either end, and not CRON_SECRET's value.`;

/**
 * The key the password is worked out from: VERIFY_ACCOUNT_SECRET once it is set, CRON_SECRET until
 * then. A VERIFY_ACCOUNT_SECRET that is set but unusable (too short, spaces or a line break at
 * either end, which the repository's copy may not have, or the same value as CRON_SECRET, which
 * would separate nothing) is an error, never a reason to fall back to CRON_SECRET.
 */
export function verifyAccountKey(env: Record<string, string | undefined>): { ok: true; name: VerifyKeyName; key: string } | { ok: false; error: string } {
  const own = env.VERIFY_ACCOUNT_SECRET ?? "";
  if (own !== "") {
    if (own.length < VERIFY_SECRET_MIN_LENGTH || own.trim() !== own || own === env.CRON_SECRET) return { ok: false, error: VERIFY_SECRET_UNUSABLE };
    return { ok: true, name: "VERIFY_ACCOUNT_SECRET", key: own };
  }
  const cron = env.CRON_SECRET ?? "";
  if (cron.length < 16) return { ok: false, error: "CRON_SECRET is not set (or is too short) on this server." };
  return { ok: true, name: "CRON_SECRET", key: cron };
}

export type VerifyAccountState = "created" | "unchanged" | "password-updated" | "deactivated" | "withdrawn" | "conflict";
const JOB = { userId: null, username: "verify-account job" } as const;

export async function ensureVerificationAccount(db: Db, env: Record<string, string | undefined> = process.env): Promise<{ ok: boolean; error?: string; summary: { username: string; state?: VerifyAccountState; key?: VerifyKeyName } }> {
  if (env.VERCEL_ENV !== "production") return { ok: false, error: "Only the production deployment keeps the verification account (VERCEL_ENV is not production).", summary: { username: VERIFY_USERNAME } };
  const chosen = verifyAccountKey(env);
  if (!chosen.ok) {
    // VERIFY_ACCOUNT_SECRET was set to take the account off CRON_SECRET: while the server cannot
    // use it, the password CRON_SECRET gave stops opening the job's own account too (fail closed).
    if ((env.VERIFY_ACCOUNT_SECRET ?? "") !== "") await withdrawCronPassword(db, env.CRON_SECRET ?? "");
    return { ok: false, error: chosen.error, summary: { username: VERIFY_USERNAME } };
  }
  // On VERIFY_ACCOUNT_SECRET, the password CRON_SECRET gave (the key before it) still proves the
  // account is this job's own, so a changed one is withdrawn rather than left as a conflict.
  const before = chosen.name === "VERIFY_ACCOUNT_SECRET" && (env.CRON_SECRET ?? "").length >= 16 ? deriveVerifyPassword(env.CRON_SECRET!) : null;
  const result = await keepAccount(db, deriveVerifyPassword(chosen.key), before);
  return { ...result, summary: { ...result.summary, key: chosen.name } };
}

async function keepAccount(db: Db, password: string, before: string | null): Promise<{ ok: boolean; error?: string; summary: { username: string; state: VerifyAccountState } }> {
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
  // Changed, yet its password is the derived one (or the one CRON_SECRET gave before
  // VERIFY_ACCOUNT_SECRET was set), so this job or a holder of the key set it: the job's own
  // account, given more access, a level, a profile or another name. The key must not open it any
  // more: the password is withdrawn and every session ends. Once the change is undone (or the
  // account deleted), the next run sets the password again (or creates the account).
  const derivedBefore = !plain && !derived && !!before && !!existing.passwordHash && (await verifyPassword(before, existing.passwordHash));
  if (!plain && (derived || derivedBefore)) {
    await db.transaction(async (tx) => {
      await tx.update(users).set({ passwordHash: null, mustChangePassword: false, temporaryPasswordExpiresAt: null, updatedAt: new Date() }).where(eq(users.id, existing.id));
      await revokeAllSessions(tx, existing.id);
    });
    await recordAudit(db, JOB, { action: "account.password-withdrawn", target: { type: "user", id: existing.id, name: VERIFY_USERNAME }, details: { purpose: "production verification", reason: "access, profile or name changed" } });
    return { ok: false, error: `The account "${VERIFY_USERNAME}" no longer has only the default member access, or its profile or name changed; its password was withdrawn, so its key no longer opens it.`, summary: { username: VERIFY_USERNAME, state: "withdrawn" } };
  }
  // A sign-in that checked the derived password just before the withdrawal can create its session
  // just after it. So while the job's own withdrawn account (its audit record says so) is still
  // changed and has no password, every run ends its sessions again: such a session lasts until the
  // next run at most. Never for any other account of that name.
  if (!plain && !existing.passwordHash && (await withdrawnByThisJob(db, existing.id))) await revokeAllSessions(db, existing.id);
  // Deactivated is the owner's off switch, whatever else it is: nothing signs in to it. The plain
  // account's password still follows a change of the key (and its sessions end), so reactivating it
  // never reopens it to the key before.
  if (!existing.isActive) {
    if (plain && !derived && existing.passwordHash) {
      await setPassword(db, existing.id, password);
      await recordAudit(db, JOB, { action: "account.password-reset", target: { type: "user", id: existing.id, name: VERIFY_USERNAME }, details: { purpose: "production verification", reason: "derived again, while deactivated" } });
    }
    return { ok: true, summary: { username: VERIFY_USERNAME, state: "deactivated" } };
  }
  if (!plain) return { ok: false, error: `An account named "${VERIFY_USERNAME}" exists that is not the plain member this job keeps, and its password is not the derived one; nothing was changed.`, summary: { username: VERIFY_USERNAME, state: "conflict" } };
  if (derived) return { ok: true, summary: { username: VERIFY_USERNAME, state: "unchanged" } };
  // The key changed (VERIFY_ACCOUNT_SECRET set, or the key in use replaced): the new password, and
  // every session opened with the old one ends (setPassword signs the account out everywhere).
  await setPassword(db, existing.id, password);
  await recordAudit(db, JOB, { action: "account.password-reset", target: { type: "user", id: existing.id, name: VERIFY_USERNAME }, details: { purpose: "production verification", reason: "derived again" } });
  return { ok: true, summary: { username: VERIFY_USERNAME, state: "password-updated" } };
}

/** Withdraws the password CRON_SECRET gave from the account, if it still has it, and ends its sessions. */
async function withdrawCronPassword(db: Db, cron: string): Promise<void> {
  if (cron.length < 16) return;
  const existing = await findUserByUsername(db, VERIFY_USERNAME);
  if (!existing?.passwordHash || !(await verifyPassword(deriveVerifyPassword(cron), existing.passwordHash))) return;
  await db.transaction(async (tx) => {
    await tx.update(users).set({ passwordHash: null, mustChangePassword: false, temporaryPasswordExpiresAt: null, updatedAt: new Date() }).where(eq(users.id, existing.id));
    await revokeAllSessions(tx, existing.id);
  });
  await recordAudit(db, JOB, { action: "account.password-withdrawn", target: { type: "user", id: existing.id, name: VERIFY_USERNAME }, details: { purpose: "production verification", reason: "VERIFY_ACCOUNT_SECRET cannot be used" } });
}

/** This job withdrew this account's password before (Admin → Audit Logs). */
async function withdrawnByThisJob(db: Db, userId: string): Promise<boolean> {
  const [row] = await db.select({ id: auditEvents.id }).from(auditEvents).where(and(eq(auditEvents.action, "account.password-withdrawn"), eq(auditEvents.targetId, userId))).limit(1);
  return !!row;
}

defineJob({
  key: "verify-account",
  description: "Production only: keeps the member account the Production check signs in with (\"verify\"): no player profile, so it is in no list, statistic or leaderboard and nothing is collected from Riot for it; the default member access; its password worked out from VERIFY_ACCOUNT_SECRET (CRON_SECRET until that is set), never stored or shown. Creates it, or changes nothing, or updates the password (and ends its sessions) after a change of that key; withdraws the password (and ends its sessions) if the account was given more access, a profile or another name.",
  defaultIntervalMinutes: null,
  run: async (ctx) => {
    const result = await ensureVerificationAccount(ctx.db);
    ctx.log(`verify-account: ${result.ok ? result.summary.state : result.error}`);
    return result;
  },
});
