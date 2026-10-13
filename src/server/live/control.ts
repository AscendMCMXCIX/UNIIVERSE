import type { Session } from "@/server/auth/permissions";
import { canControlDraft } from "@/server/auth/permissions";

export interface ControlledDraft {
  createdByUserId: string | null;
}

/**
 * Who may enter picks and bans, undo, change the draft or finish it: the account that created
 * it, or an admin (override). Everyone else watches. Drafts created before ownership existed
 * have no creator and are admin-controlled. Every draft action re-checks this on the server.
 */
export function assertCanEnterActions(draft: ControlledDraft, session: Session | null): { ok: true } | { ok: false; error: string } {
  if (!session) return { ok: false, error: "Sign in to control the draft." };
  if (canControlDraft(session, draft)) return { ok: true };
  return { ok: false, error: "You are viewing this draft. Only the player who created it (or an admin) can change it." };
}
