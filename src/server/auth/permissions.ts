/** Stored account roles. "owner" is the Admin role; "coach" is retired (migration 0007) and treated as a player. */
export type AccessRole = "owner" | "coach" | "player";

export interface Session {
  userId: string | null;
  role: AccessRole;
  label: string;
  playerId: string | null;
  username: string | null;
  /** Admins have one; players sign in with activation codes (a legacy player password may remain until their first code). */
  hasPassword: boolean;
  /** False until the player finished first-time setup (roles and champion pools). */
  setupComplete: boolean;
}

/*
  Two kinds of people:

    Owner / Admin   everything: accounts and permissions, site and Riot settings, the team
                    lineup and roster, and an override on every draft, series and match.
    Player          their own profile, pools and Riot accounts; view everything else; create
                    drafts and control the drafts (and series) they created.

  Draft-level rights are ownership, not a role: see canControlDraft. Every server action checks
  these on the server; hidden buttons are only a convenience.
*/
export type Permission =
  | "manage-team" // site-wide: branding, team settings, deleting players
  | "manage-players" // roster administration: archive/group players, edit any profile
  | "manage-users" // accounts, activation codes and permissions
  | "manage-settings" // data, Riot and engine configuration
  | "manage-lineup" // active lineup, role assignments, lineup presets
  | "manage-matches" // any match record or series (owners of a draft manage their own)
  | "create-draft" // start a draft (the creator then controls it)
  | "view-analysis";

const ADMIN = new Set<Permission>(["manage-team", "manage-players", "manage-users", "manage-settings", "manage-lineup", "manage-matches", "create-draft", "view-analysis"]);
const PLAYER = new Set<Permission>(["create-draft", "view-analysis"]);

export function isOwner(session: Pick<Session, "role"> | null): boolean {
  return session?.role === "owner";
}

/** Owner / Admin. */
export const isAdmin = isOwner;

export function hasPermission(session: Session | null, permission: Permission): boolean {
  if (!session) return false;
  return (session.role === "owner" ? ADMIN : PLAYER).has(permission);
}

/** A user may edit a player profile (roles, pools, notes, Riot accounts) when it is their own or they are an admin. */
export function canEditPlayer(session: Session | null, playerId: string): boolean {
  if (!session) return false;
  if (hasPermission(session, "manage-players")) return true;
  return !!session.playerId && session.playerId === playerId;
}

/** The creator of a draft (or series) controls it; admins may override. Drafts from before ownership (no creator) are admin-only. */
export function canControlDraft(session: Session | null, draft: { createdByUserId: string | null }): boolean {
  if (!session?.userId) return isOwner(session);
  if (isOwner(session)) return true;
  return draft.createdByUserId !== null && draft.createdByUserId === session.userId;
}

export const ROLE_LABELS_USER: Record<AccessRole, string> = { owner: "Admin", coach: "Player", player: "Player" };

/** Badge text for an account. */
export function describeAccess(user: { role: AccessRole }): string {
  return ROLE_LABELS_USER[user.role];
}
