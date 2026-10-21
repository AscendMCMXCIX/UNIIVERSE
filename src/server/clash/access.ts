import { hasPermission, type Session } from "@/server/auth/permissions";

/*
  Who may do what with the team's scouts. Every team member (with the Team page) scouts, saves to
  the team's history and reads it: saved scouts are the whole team's. The member who saved a scout
  edits or deletes it; lineup managers (Team Lineup Manager, administrators and the Owner) edit or
  delete any scout. Deleting is permanent and asks for confirmation first. The server actions
  check these again on every call.
*/

/**
 * The switch that turns Clash Scout off without a code change, should Riot ask for that:
 * UNIIVERSE_CLASH_SCOUT=off (then redeploy) hides it from the Team tabs, answers its pages with
 * Not Found and refuses its actions. Saved scouts stay stored. Anything else, or unset, is on.
 */
export function clashScoutEnabled(): boolean {
  return process.env.UNIIVERSE_CLASH_SCOUT?.trim().toLowerCase() !== "off";
}

export function canScout(session: Session | null): boolean {
  return clashScoutEnabled() && hasPermission(session, "view-team");
}

export function canEditScout(session: Session | null, createdBy: string | null): boolean {
  if (!canScout(session)) return false;
  if (hasPermission(session, "manage-lineup")) return true;
  return !!session?.userId && session.userId === createdBy;
}

/** The same people as editing: the member who saved it, or a lineup manager. */
export function canDeleteScout(session: Session | null, createdBy: string | null): boolean {
  return canEditScout(session, createdBy);
}
