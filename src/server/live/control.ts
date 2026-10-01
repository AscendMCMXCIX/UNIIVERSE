import type { Session } from "@/server/auth/permissions";
import { hasPermission } from "@/server/auth/permissions";

export interface ControlledDraft {
  controllerUserId: string | null;
}

/**
 * Who may enter picks and bans:
 *   - the current controller (whoever last took control), or
 *   - anyone with draft control rights while nobody holds control, or
 *   - an owner/coach may always take control (handoff) — but must do so explicitly so two people
 *     never enter actions at the same time by accident.
 */
export function assertCanEnterActions(draft: ControlledDraft, session: Session | null): { ok: true } | { ok: false; error: string } {
  if (!session) return { ok: false, error: "Sign in to control the draft." };
  if (draft.controllerUserId) {
    if (draft.controllerUserId === session.userId) return { ok: true };
    return { ok: false, error: "Someone else is controlling this draft. Take control to enter actions." };
  }
  if (hasPermission(session, "control-draft")) return { ok: true };
  return { ok: false, error: "You are viewing this draft. A coach or owner can hand you control." };
}

export function canTakeControl(draft: ControlledDraft, session: Session | null): boolean {
  if (!session) return false;
  if (hasPermission(session, "control-draft")) return true;
  // A player can take back control they were handed (e.g. after a reconnect).
  return draft.controllerUserId === session.userId;
}

export function canHandoff(session: Session | null, draft: ControlledDraft): boolean {
  if (!session) return false;
  return hasPermission(session, "control-draft") || draft.controllerUserId === session.userId;
}
