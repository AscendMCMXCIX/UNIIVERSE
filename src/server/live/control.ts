import type { Session } from "@/server/auth/permissions";
import { hasPermission } from "@/server/auth/permissions";

export interface ControlledDraft {
  controllerUserId: string | null;
}

/**
 * Who may enter picks and bans: only an account with draft-control rights (Owner / Admin, or a
 * Team Leader / Draft Lead), and while someone holds control, only that controller. Players
 * watch and inspect; control is never handed to them. Every draft action re-checks this on the
 * server, whatever the room shows.
 */
export function assertCanEnterActions(draft: ControlledDraft, session: Session | null): { ok: true } | { ok: false; error: string } {
  if (!session) return { ok: false, error: "Sign in to control the draft." };
  if (!hasPermission(session, "control-draft")) return { ok: false, error: "You are viewing this draft. Only Admins and Draft Leads enter picks and bans." };
  if (draft.controllerUserId && draft.controllerUserId !== session.userId) return { ok: false, error: "Someone else is controlling this draft. Take control to enter actions." };
  return { ok: true };
}

/** Taking control (explicitly, so two people never enter actions at once by accident) needs the same rights. */
export function canTakeControl(draft: ControlledDraft, session: Session | null): boolean {
  if (!session) return false;
  return hasPermission(session, "control-draft") || draft.controllerUserId === session.userId;
}

export function canHandoff(session: Session | null, draft: ControlledDraft): boolean {
  if (!session) return false;
  return hasPermission(session, "control-draft") || draft.controllerUserId === session.userId;
}

/** Accounts that may hold draft control: Owner / Admin, Team Leader, or a player flagged as Draft Lead. */
export function canHoldControl(user: { role: "owner" | "coach" | "player"; draftLead: boolean; isActive?: boolean }): boolean {
  return user.isActive !== false && (user.role === "owner" || user.role === "coach" || user.draftLead);
}
