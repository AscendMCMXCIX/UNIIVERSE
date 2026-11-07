import type { Session } from "./permissions";

/*
  The Production check's verification account (jobs/verify-account.ts keeps it; docs/LIVE_VALIDATION.md):
  a member with no player profile that the check signs in as. Its page views are the check's, not a
  member's, so what counts members' use (the field measurements) leaves them out; and its own
  Settings cannot change its username, display name or password (actions/account.ts,
  actions/users.ts), so it stays the account the job recognises and keeps. No dependencies, so any
  server module can ask without loading the job.
*/

export const VERIFY_USERNAME = "verify";
export const VERIFY_DISPLAY_NAME = "Production verification";

/**
 * The verification account as a session (or a user record) shows it: the username "verify", not the
 * Owner, no player profile. Neither its display name nor its access is asked: an account changed in
 * those ways must stay refused, or it could change its password before the job withdraws it.
 */
export function isVerificationAccount(user: Pick<Session, "username" | "playerId" | "role"> | null): boolean {
  return !!user && user.role !== "owner" && !user.playerId && (user.username ?? "").toLowerCase() === VERIFY_USERNAME;
}
