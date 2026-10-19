import { and, eq, isNotNull, ne, sql } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { lineupSlots, players, riotAccounts, users } from "@/server/db/schema";
import { getOrCreateTeam } from "@/server/repositories/team";
import { avatarUrl, createUser, findUserByUsername, getUser, listUsers, normaliseUsername, setTemporaryPassword, updateUser, UserError, validateUsername, type UserRecord } from "@/server/repositories/users";
import { revokeAllSessions } from "./sessions";
import type { IdentityCheck } from "@/server/riot/verify-identity";

/*
  Account administration, shared by Admin → People & Access.
  Every function here is the single place its rule lives; the server actions only check that
  the caller is an admin and pass the result on.
*/

type VerifiedIdentity = Extract<IdentityCheck, { status: "verified" }>;

export interface CreatedAccount {
  user: UserRecord;
  playerId: string;
  /** The temporary password, returned once for the admin to hand over; only its hash is stored. */
  temporaryPassword: string;
  expiresAt: Date;
  reusedProfile: boolean;
}

/** Placeholder until the player chooses their primary role during first-time setup (the account cannot be used before that). */

/**
 * Creates a player: user account + player profile + primary Riot account (already verified by
 * Riot, so the PUUID is stored at once) + a random temporary password, in one transaction. Any
 * failure leaves nothing behind. A profile archived when its account was deleted is reused for
 * the same Riot identity instead of creating a duplicate.
 */
export async function createVerifiedPlayerAccount(db: Db, input: { username: string; identity: VerifiedIdentity; teamMember?: boolean; createdByUserId: string | null }): Promise<CreatedAccount> {
  const teamMember = input.teamMember ?? true;
  const username = normaliseUsername(input.username);
  const invalid = validateUsername(username);
  if (invalid) throw new UserError(invalid);
  const id = input.identity;
  try {
    return await db.transaction(async (tx) => {
      if (await findUserByUsername(tx, username)) throw new UserError("That username is already taken.");
      // Re-check the Riot identity inside the transaction: the PUUID is unique across UNIIVERSE.
      const holders = await tx
        .select({ id: riotAccounts.id, playerId: riotAccounts.playerId, ownerType: riotAccounts.ownerType, archivedAt: players.archivedAt, userId: users.id })
        .from(riotAccounts)
        .leftJoin(players, eq(players.id, riotAccounts.playerId))
        .leftJoin(users, eq(users.playerId, riotAccounts.playerId))
        .where(sql`${riotAccounts.puuid} = ${id.puuid} OR (${riotAccounts.puuid} IS NULL AND lower(${riotAccounts.gameName}) = lower(${id.gameName}) AND lower(${riotAccounts.tagLine}) = lower(${id.tagLine}))`);
      let reuse: { playerId: string; accountId: string } | null = null;
      for (const h of holders) {
        if (h.ownerType === "opponent") {
          await tx.delete(riotAccounts).where(eq(riotAccounts.id, h.id)); // scouting row for the same person: the player account replaces it
          continue;
        }
        if (h.playerId && h.archivedAt && !h.userId) {
          reuse = { playerId: h.playerId, accountId: h.id };
          continue;
        }
        throw new UserError(`${id.riotId} already belongs to another player.`);
      }
      const team = await getOrCreateTeam(tx);
      let playerId: string;
      if (reuse) {
        playerId = reuse.playerId;
        await tx.update(players).set({ archivedAt: null, displayName: username, riotId: id.riotId, group: "main", teamMember, updatedAt: new Date() }).where(eq(players.id, playerId));
        // This account becomes the profile's Main; any other Main becomes an Alt (one Main each).
        await tx.update(riotAccounts).set({ label: "alt", updatedAt: new Date() }).where(and(eq(riotAccounts.playerId, playerId), eq(riotAccounts.label, "main"), sql`${riotAccounts.id} <> ${reuse.accountId}`));
        await tx
          .update(riotAccounts)
          .set({ puuid: id.puuid, gameName: id.gameName, tagLine: id.tagLine, platform: id.platform, platformSource: id.platformConfirmed ? "riot" : "user", puuidResolvedAt: new Date(), label: "main", updatedAt: new Date() })
          .where(eq(riotAccounts.id, reuse.accountId));
      } else {
        const [countRow] = await tx.select({ n: sql<number>`count(*)` }).from(players).where(eq(players.teamId, team.id));
        const [row] = await tx
          .insert(players)
          .values({ teamId: team.id, displayName: username, riotId: id.riotId, primaryRole: null, secondaryRole: null, group: "main", teamMember, sortOrder: Number(countRow?.n ?? 0) })
          .returning({ id: players.id });
        playerId = row!.id;
        await tx.insert(riotAccounts).values({
          ownerType: "player",
          playerId,
          gameName: id.gameName,
          tagLine: id.tagLine,
          platform: id.platform,
          platformSource: id.platformConfirmed ? "riot" : "user",
          puuid: id.puuid,
          puuidResolvedAt: new Date(),
          label: "main",
          syncStatus: "never",
        });
      }
      const user = await createUser(tx, { username, password: null, role: "player", playerId, setupCompletedAt: null });
      const issued = await setTemporaryPassword(tx, user.id);
      return { user: (await getUser(tx, user.id))!, playerId, temporaryPassword: issued.password, expiresAt: issued.expiresAt, reusedProfile: !!reuse };
    });
  } catch (err) {
    // A concurrent creation that won the PUUID or username race surfaces as a unique violation.
    if (!(err instanceof UserError) && /duplicate key|unique/i.test(String((err as Error).message))) throw new UserError("That username or Riot account was just taken. Reload and try again.");
    throw err;
  }
}

/** Active admins with a password, other than `exceptUserId`: the accounts that can still run UNIIVERSE. */
async function otherActiveAdmins(db: Db, exceptUserId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)` })
    .from(users)
    .where(and(eq(users.role, "owner"), eq(users.isActive, true), isNotNull(users.passwordHash), ne(users.id, exceptUserId)));
  return Number(row?.n ?? 0);
}

export async function guardLastAdmin(db: Db, target: UserRecord, what: string): Promise<void> {
  if (target.role === "owner" && (await otherActiveAdmins(db, target.id)) === 0) throw new UserError(`You cannot ${what} the last active Owner account.`);
}

export function guardSelf(actorId: string | null, targetId: string, what: string): void {
  if (actorId && actorId === targetId) throw new UserError(`You cannot ${what} your own account.`);
}

/** Deactivating signs the account out everywhere and blocks sign-in; reactivating restores it with the same password. */
export async function setAccountActive(db: Db, actorId: string | null, userId: string, active: boolean): Promise<UserRecord> {
  const target = await getUser(db, userId);
  if (!target) throw new UserError("Account not found.");
  if (!active) {
    guardSelf(actorId, userId, "deactivate");
    await guardLastAdmin(db, target, "deactivate");
  }
  await updateUser(db, userId, { isActive: active });
  if (!active) await revokeAllSessions(db, userId);
  return (await getUser(db, userId))!;
}

/**
 * Deletes the account. By default its player profile is archived, not deleted: journal entries
 * and statistics keep pointing at the same profile; the same Riot ID can later get a new account,
 * which reuses the profile. `eraseProfile` removes the profile too (pools, Riot accounts,
 * statistics, journal), for test or mistaken entries.
 */
export async function deleteAccount(db: Db, actorId: string | null, userId: string, options: { eraseProfile?: boolean } = {}): Promise<void> {
  const target = await getUser(db, userId);
  if (!target) throw new UserError("Account not found.");
  guardSelf(actorId, userId, "delete");
  await guardLastAdmin(db, target, "delete");
  await db.transaction(async (tx) => {
    await revokeAllSessions(tx, userId);
    await tx.delete(users).where(eq(users.id, userId)); // sessions, codes and invites cascade
    if (target.playerId) {
      await tx.delete(lineupSlots).where(eq(lineupSlots.playerId, target.playerId));
      if (options.eraseProfile) await tx.delete(players).where(eq(players.id, target.playerId));
      else await tx.update(players).set({ archivedAt: new Date(), updatedAt: new Date() }).where(eq(players.id, target.playerId));
    }
  });
}

/** Permanently removes a player profile that has no account (a test entry, an old roster placeholder, or what a deleted account left behind). */
export async function deleteProfile(db: Db, playerId: string): Promise<void> {
  const [linked] = await db.select({ id: users.id }).from(users).where(eq(users.playerId, playerId));
  if (linked) throw new UserError("This profile belongs to an account: delete the account instead.");
  const [exists] = await db.select({ id: players.id }).from(players).where(eq(players.id, playerId));
  if (!exists) throw new UserError("Player not found.");
  await db.transaction(async (tx) => {
    await tx.delete(lineupSlots).where(eq(lineupSlots.playerId, playerId));
    await tx.delete(players).where(eq(players.id, playerId)); // pools, Riot accounts, statistics and journal cascade
  });
}

/**
 * Owner → Player (never the reverse: UNIIVERSE has one Owner, so no account is promoted).
 * Demoting the last active Owner, or yourself, is refused.
 */
export async function setAccountRole(db: Db, actorId: string | null, userId: string, role: "owner" | "player"): Promise<UserRecord> {
  const target = await getUser(db, userId);
  if (!target) throw new UserError("Account not found.");
  if (role === "owner" && target.role !== "owner") throw new UserError("There is one Owner account (the administrative account). Other accounts get access levels and groups instead.");
  if (role !== "owner") {
    guardSelf(actorId, userId, "remove Owner access from");
    await guardLastAdmin(db, target, "remove Owner access from");
  }
  await updateUser(db, userId, { role });
  return (await getUser(db, userId))!;
}

export interface AccountView {
  userId: string;
  username: string;
  displayName: string;
  role: "owner" | "coach" | "player";
  isActive: boolean;
  setupComplete: boolean;
  hasPassword: boolean;
  lastLoginAt: string | null;
  playerId: string | null;
  playerName: string | null;
  /** set = a permanent password · temporary = waiting to be replaced · expired = temporary and expired · none = cannot sign in yet. */
  password: { state: "set" | "temporary" | "expired" | "none"; expiresAt: string | null };
  /** Effective capabilities (players; owners hold all) and how they were chosen. */
  capabilities: string[];
  /** The base level's capabilities, without the additional groups. */
  baseCapabilities: string[];
  /** Additional access groups on top of the base level. */
  accessGroups: string[];
  permissionPresetId: string | null;
  hasCustomCapabilities: boolean;
  avatarUrl: string | null;
  /** Member of the competitive team (accounts without a player profile count as members). */
  teamMember: boolean;
}

/** Every account with its status and password state (never the password), for both admin pages. */
export async function listAccountViews(db: Db, now: Date = new Date()): Promise<AccountView[]> {
  const accounts = await listUsers(db);
  return accounts.map((u) => ({
    userId: u.id,
    username: u.username,
    displayName: u.displayName,
    role: u.role,
    isActive: u.isActive,
    setupComplete: u.setupCompletedAt !== null,
    hasPassword: u.hasPassword,
    lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
    playerId: u.playerId,
    playerName: u.playerName,
    password: {
      state: !u.hasPassword ? "none" : !u.mustChangePassword ? "set" : u.temporaryPasswordExpiresAt && u.temporaryPasswordExpiresAt <= now ? "expired" : "temporary",
      expiresAt: u.mustChangePassword ? (u.temporaryPasswordExpiresAt?.toISOString() ?? null) : null,
    },
    capabilities: u.capabilities,
    baseCapabilities: u.baseCapabilities,
    accessGroups: u.accessGroups,
    permissionPresetId: u.permissionPresetId,
    hasCustomCapabilities: u.hasCustomCapabilities,
    avatarUrl: avatarUrl(u.id, u.avatarVersion),
    teamMember: u.teamMember,
  }));
}

/** Admin password reset: a new random temporary password the user must replace at next sign-in. Not for your own account (use Settings). */
export async function resetPasswordToTemporary(db: Db, actorId: string | null, userId: string): Promise<{ password: string; expiresAt: Date }> {
  const target = await getUser(db, userId);
  if (!target) throw new UserError("Account not found.");
  if (actorId && actorId === userId) throw new UserError("Change your own password under Settings instead.");
  if (!target.isActive) throw new UserError("This account is deactivated. Reactivate it first.");
  return setTemporaryPassword(db, userId);
}
