import { createHmac } from "node:crypto";
import type { Db } from "@/server/db/types";
import { defineJob } from "./registry";
import { createUser, findUserByUsername, setPassword } from "@/server/repositories/users";
import { verifyPassword } from "@/server/auth/password";
import { recordAudit } from "@/server/audit/log";
import { VERIFY_DISPLAY_NAME, VERIFY_USERNAME } from "@/server/auth/verification-account";

/*
  THE PRODUCTION VERIFICATION ACCOUNT (docs/LIVE_VALIDATION.md). The daily Production check signs in
  with it to open the member pages on the live site as a member sees them.

  It is an ordinary member account with no player profile: role "player", no access group, no
  custom permissions, not an administrator, first-time setup marked done. With no profile it is in
  no list a member sees (Players, the lineup, leaderboards, statistics, insights: they all read
  player profiles), it has no Riot account, so nothing is collected for it, and it holds exactly
  the access a new member gets (the default access level). It signs in through the normal sign-in
  form, with its password checked like anyone's and the same throttling.

  Nobody types or keeps its password. It is derived from CRON_SECRET (an HMAC with a fixed label),
  which both this server and the Production check already hold, so each works it out on its own:
  it is never stored anywhere but as the account's password hash, and never printed (the workflow
  masks it). Whoever holds CRON_SECRET can therefore sign in as this member account. Those are the
  people who can already run every job and reach the database through Vercel and Supabase. A
  change of CRON_SECRET changes the password: run this job again.

  `verify-account` (Data jobs, by hand; production only) creates the account, or changes nothing
  when its password is already the derived one, or updates the password after a CRON_SECRET change.
  It never touches an account of that name it did not make (one with a profile, an administrator,
  extra access), and leaves a deactivated one deactivated: deactivating it in Admin is how the
  owner turns the signed-in checks off.
*/

export { VERIFY_DISPLAY_NAME, VERIFY_USERNAME };
const LABEL = "uniiverse:production-verification-account:v1";

/** The account's password, worked out from CRON_SECRET (base64url HMAC-SHA256; the workflow does the same with openssl). */
export function deriveVerifyPassword(cronSecret: string): string {
  return createHmac("sha256", cronSecret).update(LABEL, "utf8").digest("base64url");
}

export type VerifyAccountState = "created" | "unchanged" | "password-updated" | "deactivated" | "conflict";

export async function ensureVerificationAccount(db: Db, env: Record<string, string | undefined> = process.env): Promise<{ ok: boolean; error?: string; summary: { username: string; state?: VerifyAccountState } }> {
  const secret = env.CRON_SECRET ?? "";
  if (env.VERCEL_ENV !== "production") return { ok: false, error: "Only the production deployment keeps the verification account (VERCEL_ENV is not production).", summary: { username: VERIFY_USERNAME } };
  if (secret.length < 16) return { ok: false, error: "CRON_SECRET is not set (or is too short) on this server.", summary: { username: VERIFY_USERNAME } };
  const password = deriveVerifyPassword(secret);
  const existing = await findUserByUsername(db, VERIFY_USERNAME);
  if (!existing) {
    const user = await createUser(db, { username: VERIFY_USERNAME, displayName: VERIFY_DISPLAY_NAME, password, role: "player", playerId: null });
    await recordAudit(db, { userId: null, username: "verify-account job" }, { action: "account.create", target: { type: "user", id: user.id, name: VERIFY_USERNAME }, details: { purpose: "production verification", profile: false } });
    return { ok: true, summary: { username: VERIFY_USERNAME, state: "created" } };
  }
  // Only an account shaped as this job makes it: no profile, a plain member, no extra access.
  const ours = !existing.playerId && existing.role === "player" && !existing.isAdmin && (existing.accessGroups ?? []).length === 0 && existing.customCapabilities === null && existing.displayName === VERIFY_DISPLAY_NAME;
  if (!ours) return { ok: false, error: `An account named "${VERIFY_USERNAME}" already exists and was not made by this job; nothing was changed.`, summary: { username: VERIFY_USERNAME, state: "conflict" } };
  if (!existing.isActive) return { ok: true, summary: { username: VERIFY_USERNAME, state: "deactivated" } };
  if (existing.passwordHash && (await verifyPassword(password, existing.passwordHash))) return { ok: true, summary: { username: VERIFY_USERNAME, state: "unchanged" } };
  await setPassword(db, existing.id, password);
  await recordAudit(db, { userId: null, username: "verify-account job" }, { action: "account.password-reset", target: { type: "user", id: existing.id, name: VERIFY_USERNAME }, details: { purpose: "production verification", reason: "derived again" } });
  return { ok: true, summary: { username: VERIFY_USERNAME, state: "password-updated" } };
}

defineJob({
  key: "verify-account",
  description: "Production only: keeps the member account the Production check signs in with (\"verify\"): no player profile, so it is in no list, statistic or leaderboard and nothing is collected from Riot for it; the default member access; its password worked out from CRON_SECRET, never stored or shown. Creates it, or changes nothing, or updates the password after a CRON_SECRET change.",
  defaultIntervalMinutes: null,
  run: async (ctx) => {
    const result = await ensureVerificationAccount(ctx.db);
    ctx.log(`verify-account: ${result.ok ? result.summary.state : result.error}`);
    return result;
  },
});
