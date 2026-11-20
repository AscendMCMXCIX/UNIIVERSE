import { eq } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { players, users } from "@/server/db/schema";
import { getUser, UserError, type UserRecord } from "@/server/repositories/users";
import { loadSocialLinks, removeAvatar, setAvatar, setDisplayName, setSocialLinks } from "@/server/repositories/profile";
import { setAccessGroups, setAccessLevel, type AccessLevelChoice } from "@/server/repositories/permissions";
import type { SocialKind, SocialLinks } from "@/domain/social-links";
import { SOCIAL_KINDS, visibleSocialLinks } from "@/domain/social-links";
import { getOrCreateTeam, setTeamMember } from "@/server/repositories/team";
import { guardOwnerAccount, guardProfileAccount, guardSelf, guardVerificationAccount, setAdministrator } from "./account-admin";
import { revokeAllSessions } from "./sessions";

/*
  The Owner's and administrators' tools on another member's account (the overhaul's S9b). The
  rules are the same as account-admin.ts: only the Owner changes the Owner account, the
  verification account is kept by its job, and nobody uses these on their own account (Settings
  has the member's own controls). The server actions check who is asking first, then call these.
*/

async function target(db: Db, userId: string): Promise<UserRecord> {
  const user = typeof userId === "string" ? await getUser(db, userId) : null;
  if (!user) throw new UserError("Account not found.");
  return user;
}

/** The Owner gives a member a new display name: the members' own rules, account and profile in step. */
export async function setMemberDisplayName(db: Db, actorId: string, userId: string, next: string): Promise<{ displayName: string }> {
  const actor = await getUser(db, actorId);
  if (actor?.role !== "owner") throw new UserError("Only the Owner changes another member's display name.");
  const user = await target(db, userId);
  guardSelf(actorId, userId, "rename here");
  guardVerificationAccount(actorId, user, "rename");
  if (typeof next !== "string") throw new UserError("Enter a display name.");
  return setDisplayName(db, userId, next);
}

/**
 * Ends every session of another account. Returns how many ended, for the server and its tests
 * only: the screen and the audit row say "Signed out everywhere" (the privacy notice says nobody
 * in the app sees sign-in sessions).
 */
export async function signOutEverywhere(db: Db, actorId: string, userId: string): Promise<number> {
  const user = await target(db, userId);
  if (actorId === userId) throw new UserError("Use Settings → Sign out of other devices for your own account.");
  guardVerificationAccount(actorId, user, "sign out");
  await guardOwnerAccount(db, actorId, user, "sign out");
  return revokeAllSessions(db, userId);
}

/** Replaces or removes another member's picture (moderation). `data` is the checked image; null removes it. */
export async function moderateAvatar(db: Db, actorId: string, userId: string, data: Buffer | null): Promise<number | null> {
  const user = await target(db, userId);
  guardSelf(actorId, userId, "moderate the picture of");
  guardVerificationAccount(actorId, user, "change the picture of");
  await guardOwnerAccount(db, actorId, user, "change the picture of");
  if (data === null) {
    await removeAvatar(db, userId);
    return null;
  }
  return setAvatar(db, userId, data);
}

/**
 * Hides a public social link (it stays, seen only by its owner in Settings) or removes it. Only a
 * link its owner shows publicly, as Admin lists them: one they keep to themselves is theirs alone,
 * even here, and is answered exactly as a link that is not there, so nothing tells the two apart.
 * Never on your own profile's links (Settings has them).
 */
export async function moderateSocialLink(db: Db, actorId: string, playerId: string, kind: SocialKind, mode: "hide" | "remove"): Promise<SocialLinks | null> {
  if (!SOCIAL_KINDS.includes(kind)) throw new UserError("Unknown link.");
  if (mode !== "hide" && mode !== "remove") throw new UserError("Choose hide or remove.");
  const [profile] = typeof playerId === "string" ? await db.select({ id: players.id }).from(players).where(eq(players.id, playerId)) : [];
  if (!profile) throw new UserError("Player not found.");
  const [account] = await db.select({ id: users.id }).from(users).where(eq(users.playerId, playerId));
  if (account) guardSelf(actorId, account.id, "moderate the links of");
  await guardProfileAccount(db, actorId, playerId, "change the links of");
  const links = (await loadSocialLinks(db, [playerId])).get(playerId) ?? null;
  if (!links?.[kind] || !visibleSocialLinks(links).some((l) => l.kind === kind)) throw new UserError("That link is not there any more.");
  const next: SocialLinks = { ...links };
  if (mode === "remove") delete next[kind];
  else next[kind] = { ...links[kind]!, public: false };
  const stored = Object.keys(next).length ? next : null;
  await setSocialLinks(db, playerId, stored);
  return stored;
}

export interface AccessSave {
  level: AccessLevelChoice;
  groups: string[];
  administrator: boolean;
  /** Team member (true) or personal use (false), for an account with a player profile; left as it is when omitted. */
  teamMember?: boolean;
  /** The second confirmation the dialog asks for before granting administrator access. */
  confirmAdministrator?: boolean;
}

export interface AccessSaved {
  user: UserRecord;
  administratorChanged: boolean;
  teamMemberChanged: boolean;
  /** The base level changed (another preset, custom from or to a preset, or other custom abilities). */
  levelChanged: boolean;
  /** The extra access groups changed. */
  groupsChanged: boolean;
}

/** An account's base level, comparable before and after a save: its preset (null is the default), or its own abilities. */
const levelOf = (u: UserRecord) => (u.hasCustomCapabilities ? `custom:${[...u.baseCapabilities].sort().join()}` : `preset:${u.permissionPresetId ?? "default"}`);
const groupsOf = (u: UserRecord) => [...u.accessGroups].sort().join();

/**
 * Team membership, access level, extra groups and administrator access in one transaction (D6): either all of it
 * is saved or none of it. Each step keeps its own rules (setAccessLevel, setAccessGroups,
 * setAdministrator); granting administrator access needs `confirmAdministrator` and the Owner.
 */
export async function saveAccess(db: Db, actorId: string, userId: string, input: AccessSave): Promise<AccessSaved> {
  if (!input || typeof input !== "object" || !input.level || !Array.isArray(input.groups) || typeof input.administrator !== "boolean") throw new UserError("Choose the access to save.");
  const before = await target(db, userId);
  guardSelf(actorId, userId, "change the access of");
  guardVerificationAccount(actorId, before, "change the access of");
  if (before.role === "owner") throw new UserError("The Owner always has full access.");
  if (input.level.level === "owner") throw new UserError("There is one Owner account (the administrative account). Other accounts get access levels and groups instead.");
  if (input.administrator && !before.isAdmin && input.confirmAdministrator !== true) throw new UserError("Confirm that they should have administrator access. Nothing was saved.");
  if (input.teamMember !== undefined && typeof input.teamMember !== "boolean") throw new UserError("Choose team member or personal use.");
  return db.transaction(async (tx) => {
    let teamMemberChanged = false;
    if (input.teamMember !== undefined && before.playerId) {
      const [profile] = await tx.select({ teamMember: players.teamMember }).from(players).where(eq(players.id, before.playerId));
      if (profile && profile.teamMember !== input.teamMember) {
        await setTeamMember(tx, (await getOrCreateTeam(tx)).id, before.playerId, input.teamMember);
        teamMemberChanged = true;
      }
    }
    await setAccessLevel(tx, actorId, userId, input.level);
    await setAccessGroups(tx, actorId, userId, input.groups);
    const { changed } = await setAdministrator(tx, actorId, userId, input.administrator);
    const user = (await getUser(tx, userId))!;
    return { user, administratorChanged: changed, teamMemberChanged, levelChanged: levelOf(user) !== levelOf(before), groupsChanged: groupsOf(user) !== groupsOf(before) };
  });
}
