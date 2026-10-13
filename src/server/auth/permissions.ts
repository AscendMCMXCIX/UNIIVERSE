export type AccessRole = "owner" | "coach" | "player";

export interface Session {
  userId: string | null;
  role: AccessRole;
  /** Team Leader / Draft Lead flag on a player account (lineup and draft control without admin rights). */
  draftLead: boolean;
  label: string;
  playerId: string | null;
  username: string | null;
  /** False for accounts created without a password: they can only use the session that created them until one is set. */
  hasPassword: boolean;
}

/*
  Three kinds of people, deliberately small:

    Owner / Admin        everything, including users, permissions, site and data settings.
    Team Leader / Draft  the competitive controls: lineup, role assignments, drafts, series and
    Lead                 match records. Either the "coach" account role or the draft-lead flag on
                         a player account. No users, settings, keys or other players' pools.
    Player               their own profile, pools and Riot accounts; everything else read-only.
*/
export type Permission =
  | "manage-team" // site-wide: branding, team settings, deleting players
  | "manage-players" // roster administration: create/archive/group players, edit any profile
  | "manage-users" // accounts and permissions
  | "manage-settings" // data, Riot and engine configuration
  | "manage-lineup" // active lineup, role assignments, lineup presets
  | "control-draft" // enter picks and bans in official drafts
  | "manage-matches" // match records and series
  | "view-analysis";

const OWNER = new Set<Permission>(["manage-team", "manage-players", "manage-users", "manage-settings", "manage-lineup", "control-draft", "manage-matches", "view-analysis"]);
const DRAFT_LEAD = new Set<Permission>(["manage-lineup", "control-draft", "manage-matches", "view-analysis"]);
const PLAYER = new Set<Permission>(["view-analysis"]);

export function isOwner(session: Session | null): boolean {
  return session?.role === "owner";
}

/** Team Leader / Draft Lead: the coach account role, or a player carrying the flag. Owners always qualify. */
export function isDraftLead(session: Session | null): boolean {
  if (!session) return false;
  return session.role === "owner" || session.role === "coach" || session.draftLead;
}

function permissionsFor(session: Session): Set<Permission> {
  if (session.role === "owner") return OWNER;
  if (session.role === "coach" || session.draftLead) return DRAFT_LEAD;
  return PLAYER;
}

export function hasPermission(session: Session | null, permission: Permission): boolean {
  if (!session) return false;
  return permissionsFor(session).has(permission);
}

/** A user may edit a player profile (roles, pools, notes, Riot accounts) when it is their own or they administer the roster. */
export function canEditPlayer(session: Session | null, playerId: string): boolean {
  if (!session) return false;
  if (hasPermission(session, "manage-players")) return true;
  return session.playerId === playerId;
}

/** Draft control rights (owner, Team Leader / Draft Lead). */
export function canEdit(session: Session | null): boolean {
  return hasPermission(session, "control-draft");
}

export const ROLE_LABELS_USER: Record<AccessRole, string> = { owner: "Owner / Admin", coach: "Team Leader / Draft Lead", player: "Player" };

/** Short badge text for a member list: the account role plus the draft-lead flag where it adds something. */
export function describeAccess(user: { role: AccessRole; draftLead: boolean }): string {
  if (user.role === "player" && user.draftLead) return "Player · Draft Lead";
  return ROLE_LABELS_USER[user.role];
}
