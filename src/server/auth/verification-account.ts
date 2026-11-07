import type { Session } from "./permissions";

/*
  The Production check's verification account (jobs/verify-account.ts keeps it; docs/LIVE_VALIDATION.md):
  a member with no player profile that the check signs in as. Its page views are the check's, not a
  member's, so what counts members' use (the field measurements) leaves them out. No dependencies,
  so any server module can ask without loading the job.
*/

export const VERIFY_USERNAME = "verify";
export const VERIFY_DISPLAY_NAME = "Production verification";

/** The verification account as the job keeps it: that username and no player profile. */
export function isVerificationSession(session: Pick<Session, "username" | "playerId"> | null): boolean {
  return !!session && session.username === VERIFY_USERNAME && !session.playerId;
}
