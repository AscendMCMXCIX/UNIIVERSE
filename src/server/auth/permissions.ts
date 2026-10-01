export type AccessRole = "owner" | "coach" | "player";

export interface Session {
  userId: string | null;
  role: AccessRole;
  label: string;
  playerId: string | null;
  email: string | null;
}

export type Permission =
  | "manage-team" // players, groups, lineups, branding, settings, users
  | "manage-players"
  | "manage-users"
  | "manage-settings"
  | "control-draft"
  | "manage-opponents"
  | "manage-matches"
  | "view-analysis";

const ROLE_PERMISSIONS: Record<AccessRole, Set<Permission>> = {
  owner: new Set(["manage-team", "manage-players", "manage-users", "manage-settings", "control-draft", "manage-opponents", "manage-matches", "view-analysis"]),
  coach: new Set(["control-draft", "manage-opponents", "manage-matches", "view-analysis", "manage-players"]),
  player: new Set(["view-analysis"]),
};

export function hasPermission(session: Session | null, permission: Permission): boolean {
  if (!session) return false;
  return ROLE_PERMISSIONS[session.role].has(permission);
}

/** A user may edit a player profile when they manage players or when it is their own claimed profile. */
export function canEditPlayer(session: Session | null, playerId: string): boolean {
  if (!session) return false;
  if (hasPermission(session, "manage-players")) return true;
  return session.playerId === playerId;
}

export function canEdit(session: Session | null): boolean {
  return hasPermission(session, "control-draft");
}

export function isOwner(session: Session | null): boolean {
  return session?.role === "owner";
}

export const ROLE_LABELS_USER: Record<AccessRole, string> = { owner: "Owner / Admin", coach: "Coach / Analyst", player: "Player" };
