import { hasPermission, isOwner, type Session } from "@/server/auth/permissions";

/*
  Who may do what with the team's scouts. Every team member (with the Team page) scouts, saves to
  the team's history, reads it, and edits the scouts they created. Lineup managers (Team Lineup
  Manager, and the Owner) edit any scout and archive or restore it. Permanent deletion is the
  Owner's (the team leader's account). The server actions check these again on every call.
*/

export function canScout(session: Session | null): boolean {
  return hasPermission(session, "view-team");
}

export function canEditScout(session: Session | null, createdBy: string | null): boolean {
  if (!canScout(session)) return false;
  if (hasPermission(session, "manage-lineup")) return true;
  return !!session?.userId && session.userId === createdBy;
}

export function canArchiveScouts(session: Session | null): boolean {
  return canScout(session) && hasPermission(session, "manage-lineup");
}

export function canDeleteScouts(session: Session | null): boolean {
  return isOwner(session);
}
