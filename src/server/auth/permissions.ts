/** Stored account roles. "owner" is the Admin role; "coach" is retired (migration 0007) and treated as a player. */
export type AccessRole = "owner" | "coach" | "player";

export interface Session {
  userId: string | null;
  role: AccessRole;
  label: string;
  playerId: string | null;
  username: string | null;
  hasPassword: boolean;
  /** Signed in with an admin-issued temporary password: must choose a permanent one before anything else. */
  mustChangePassword: boolean;
  /** False until the player finished first-time setup (roles and champion pools). */
  setupComplete: boolean;
  /** Effective capabilities for a non-owner (preset or custom); undefined means Standard Player. Owners hold every capability. */
  capabilities?: readonly Capability[];
  /** Profile picture version (null/undefined = none). */
  avatarVersion?: number | null;
}

/*
  Two kinds of account, plus configurable capabilities:

    Owner / Admin   every capability, including the owner-only ones that are never delegated
                    (accounts, passwords, permissions, deleting players).
    Player          the capabilities of their permission preset (Standard Player by default) or
                    of a custom set an admin chose for them in Admin → People & Access.

  Draft-level rights are ownership, not a capability: see canControlDraft. Every server action
  checks capabilities on the server; hidden buttons are only a convenience.
*/

/** Capabilities an admin can grant to or remove from a player (Admin → People & Access). */
export const CAPABILITIES = [
  { key: "view-team", group: "View", label: "View the Team page", description: "The current main lineup and its champions." },
  { key: "view-players", group: "View", label: "View the Players directory", description: "Everyone's roles, champion pools and linked Riot accounts." },
  { key: "view-teammate-stats", group: "View", label: "View teammates' statistics", description: "Season records, champion statistics and proficiency on other players' profiles." },
  { key: "view-trends", group: "View", label: "View Trends", description: "Patch trends, contested champions and pro patterns." },
  { key: "view-matches", group: "View", label: "View Match History", description: "Completed drafts, playbooks and results." },
  { key: "create-draft", group: "Draft", label: "Create drafts", description: "Start a draft; the creator controls it." },
  { key: "edit-own-profile", group: "Own profile", label: "Edit own roles and champion pools", description: "Their own primary/secondary role and pools." },
  { key: "manage-own-riot-accounts", group: "Own profile", label: "Manage own Riot accounts", description: "Add, remove and refresh their own linked Riot accounts." },
  { key: "manage-lineup", group: "Team management", label: "Manage the official lineup", description: "Choose who plays each role in the main lineup." },
  { key: "manage-players", group: "Team management", label: "Manage other players", description: "Edit other players' profiles and pools, archive players, Main / Other." },
  { key: "manage-matches", group: "Team management", label: "Manage any match", description: "Edit or delete any match record or series, and take over any draft." },
  { key: "manage-competition", group: "Site settings", label: "Manage competition settings", description: "Pool limits and draft engine weights." },
  { key: "manage-branding", group: "Site settings", label: "Manage branding", description: "Name, tagline, logo, background and colours." },
  { key: "manage-data", group: "Site settings", label: "Manage Riot and data settings", description: "Run data jobs, schedules, Riot connection checks and system health." },
] as const;

export type Capability = (typeof CAPABILITIES)[number]["key"];

/**
 * Owner-only: never part of a preset or a custom set, so a delegated admin can never reach
 * accounts, passwords, permissions or permanent deletion.
 */
export type OwnerOnlyPermission = "manage-users";

export type Permission = Capability | OwnerOnlyPermission;

export const CAPABILITY_KEYS: readonly Capability[] = CAPABILITIES.map((c) => c.key);

/** The built-in default (Standard Player): ordinary team and player features plus their own information. */
export const STANDARD_PLAYER: readonly Capability[] = ["view-team", "view-players", "view-teammate-stats", "view-trends", "view-matches", "create-draft", "edit-own-profile", "manage-own-riot-accounts"];

/**
 * Capabilities that open the Admin area (each admin page checks its own). Managing the lineup is
 * done in place on the Team page, so it does not open the Admin area; managing matches is done
 * from Matches and the Draft page, likewise.
 */
export const ADMIN_CAPABILITIES: readonly Capability[] = ["manage-players", "manage-competition", "manage-branding", "manage-data"];

/**
 * Additional access groups: ready-made bundles a player can hold on top of their base access
 * level, so someone can, say, run the lineup without becoming an Administrator. Groups only add
 * capabilities (never take any away) and never include the Owner-only ones: accounts,
 * passwords and permissions stay with Owners.
 */
export const ACCESS_GROUPS = [
  { key: "lineup-manager", label: "Team Lineup Manager", description: "Assign, swap and clear players in the official five-person lineup, directly on Team Overview.", capabilities: ["manage-lineup"] },
  { key: "match-manager", label: "Match Manager", description: "Correct or delete any match record or series, and take over any draft.", capabilities: ["manage-matches"] },
  { key: "player-manager", label: "Player Manager", description: "Edit other players' roles, champion pools and Riot accounts; Main / Other; archive profiles.", capabilities: ["manage-players"] },
  { key: "draft-settings-manager", label: "Draft Settings Manager", description: "Draft engine weights and champion update handling.", capabilities: ["manage-competition"] },
  { key: "branding-manager", label: "Branding Manager", description: "Team name, tagline, logo, backgrounds and colours.", capabilities: ["manage-branding"] },
  { key: "data-manager", label: "Data Manager", description: "Riot data jobs and schedules, Riot connection checks and System Health.", capabilities: ["manage-data"] },
] as const satisfies ReadonlyArray<{ key: string; label: string; description: string; capabilities: readonly Capability[] }>;

export type AccessGroupKey = (typeof ACCESS_GROUPS)[number]["key"];

/** Keeps only known group keys (stored JSON may be stale or hand-edited), each once. */
export function sanitiseAccessGroups(value: unknown): AccessGroupKey[] {
  if (!Array.isArray(value)) return [];
  const known = new Set<string>(ACCESS_GROUPS.map((g) => g.key));
  return [...new Set(value.filter((v): v is AccessGroupKey => typeof v === "string" && known.has(v)))];
}

/** Base capabilities plus those of the additional groups: what the account may actually do. */
export function withAccessGroups(base: readonly Capability[], groups: readonly string[]): Capability[] {
  const extra = ACCESS_GROUPS.filter((g) => groups.includes(g.key)).flatMap((g) => g.capabilities as readonly Capability[]);
  return [...new Set([...base, ...extra])];
}

/** Keeps only known capability keys (stored JSON may be stale or hand-edited). */
export function sanitiseCapabilities(value: unknown): Capability[] {
  if (!Array.isArray(value)) return [];
  const known = new Set<string>(CAPABILITY_KEYS);
  return [...new Set(value.filter((v): v is Capability => typeof v === "string" && known.has(v)))];
}

export function isOwner(session: Pick<Session, "role"> | null): boolean {
  return session?.role === "owner";
}

/** Owner / Admin. */
export const isAdmin = isOwner;

/** The capabilities a session holds (an owner holds every capability). */
export function capabilitiesOf(session: Session | null): ReadonlySet<Capability> {
  if (!session) return new Set();
  if (session.role === "owner") return new Set(CAPABILITY_KEYS);
  return new Set(session.capabilities ?? STANDARD_PLAYER);
}

export function hasPermission(session: Session | null, permission: Permission): boolean {
  if (!session) return false;
  if (session.role === "owner") return true;
  if (permission === "manage-users") return false;
  return capabilitiesOf(session).has(permission);
}

/** May open the Admin area: owners, and players granted at least one admin capability. */
export function canUseAdminArea(session: Session | null): boolean {
  return isOwner(session) || ADMIN_CAPABILITIES.some((c) => hasPermission(session, c));
}

/** A user may edit a player profile (roles, pools, notes) when it is their own (with the capability) or they manage players. */
export function canEditPlayer(session: Session | null, playerId: string): boolean {
  if (!session) return false;
  if (hasPermission(session, "manage-players")) return true;
  return !!session.playerId && session.playerId === playerId && hasPermission(session, "edit-own-profile");
}

/** A user may add, remove or refresh a player's Riot accounts: their own (with the capability) or as a player manager. */
export function canManageRiotAccounts(session: Session | null, playerId: string): boolean {
  if (!session) return false;
  if (hasPermission(session, "manage-players")) return true;
  return !!session.playerId && session.playerId === playerId && hasPermission(session, "manage-own-riot-accounts");
}

/** The creator of a draft (or series) controls it; admins and match managers may override. Drafts from before ownership (no creator) are admin-only. */
export function canControlDraft(session: Session | null, draft: { createdByUserId: string | null }): boolean {
  if (!session?.userId) return isOwner(session);
  if (isOwner(session) || hasPermission(session, "manage-matches")) return true;
  return draft.createdByUserId !== null && draft.createdByUserId === session.userId;
}

export const ROLE_LABELS_USER: Record<AccessRole, string> = { owner: "Owner", coach: "Player", player: "Player" };

/** Badge text for an account. */
export function describeAccess(user: { role: AccessRole }): string {
  return ROLE_LABELS_USER[user.role];
}
