import { NotAuthorizedError } from "@/server/auth/session";
import type { Session } from "@/server/auth/permissions";

/**
 * The journal owner is always the signed-in user's own player profile. No action or page takes
 * a player id as input, so a request can only ever touch the caller's journal.
 */
export function journalOwnerFor(session: Session | null): string {
  if (!session?.userId) throw new NotAuthorizedError("Please sign in.");
  if (!session.playerId) throw new NotAuthorizedError("Complete your player profile first (My profile).");
  return session.playerId;
}
