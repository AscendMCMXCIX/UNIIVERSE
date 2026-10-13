import { and, eq, isNull, sql } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { players, riotAccounts, users } from "@/server/db/schema";
import { ROLES, type Role } from "@/domain/roles";
import { parseRiotId } from "@/server/accounts/repository";
import { parsePlatforms } from "@/server/riot/api/client";
import { DEFAULT_RIOT_PLATFORM, isRiotPlatform } from "@/domain/riot-platforms";
import { getOrCreateTeam } from "@/server/repositories/team";
import { consumeInvite, createUser, getUser, getValidInvite, UserError, validateUsername, type UserRecord } from "@/server/repositories/users";
import { validatePasswordStrength } from "./password";
import type { AccessRole } from "./permissions";

/**
 * Account creation. A normal UNIIVERSE account is a user row, its player profile and the
 * player's Riot account(s), created in one transaction so a half-finished sign-up can never
 * leave an account without a profile or a profile without its account. Riot IDs are stored as
 * typed (full Unicode) and resolved to PUUIDs later by the account-sync job, so Riot being
 * unreachable never blocks registration.
 */

export interface RiotIdInput {
  riotId: string;
  platform: string;
}

export interface RegisterInput {
  username: string;
  password?: string | null;
  role: AccessRole;
  primaryRiot: RiotIdInput;
  extraRiot?: RiotIdInput[];
  primaryRole: Role;
  secondaryRole?: Role | null;
  /** Invite token (consumed in the same transaction). */
  inviteToken?: string | null;
  /** Placeholder player profile to take over instead of creating one (from a bound invite). */
  playerId?: string | null;
}

interface ParsedAccount {
  gameName: string;
  tagLine: string;
  platform: string;
  label: "main" | "alt";
}

/**
 * Region the sign-up selector starts on. The selector is only a fallback (Riot confirms the
 * actual server during verification), so it defaults to the team's home server: OCE, or
 * RIOT_DEFAULT_PLATFORM when set.
 */
export function defaultPlatform(env: NodeJS.ProcessEnv = process.env): string {
  const configured = (env.RIOT_DEFAULT_PLATFORM ?? "").trim().toLowerCase();
  return isRiotPlatform(configured) ? configured : DEFAULT_RIOT_PLATFORM;
}

function parseAccounts(primary: RiotIdInput, extras: RiotIdInput[]): ParsedAccount[] {
  const out: ParsedAccount[] = [];
  const seen = new Set<string>();
  const all = [{ ...primary, label: "main" as const }, ...extras.map((e) => ({ ...e, label: "alt" as const }))];
  for (const entry of all) {
    if (!entry.riotId.trim()) {
      if (entry.label === "main") throw new UserError("Your Riot ID is required (GameName#TAG, exactly as shown in the client).");
      continue; // blank optional rows are ignored
    }
    const parsed = parseRiotId(entry.riotId);
    if (!parsed) throw new UserError(`"${entry.riotId.trim()}" is not a valid Riot ID. Use GameName#TAG exactly as shown in the client.`);
    const platform = parsePlatforms(entry.platform, [])[0];
    if (!platform) throw new UserError("Choose the region of each Riot account.");
    const key = `${platform}|${parsed.gameName.toLowerCase()}|${parsed.tagLine.toLowerCase()}`;
    if (seen.has(key)) continue; // the same account listed twice counts once
    seen.add(key);
    out.push({ ...parsed, platform, label: entry.label });
  }
  return out;
}

/** Riot IDs already linked to another player (case-insensitive). */
async function findTakenRiotIds(db: Db, accounts: ParsedAccount[], exceptPlayerId: string | null): Promise<string[]> {
  const taken: string[] = [];
  for (const a of accounts) {
    const [row] = await db
      .select({ playerId: riotAccounts.playerId })
      .from(riotAccounts)
      .where(and(eq(riotAccounts.platform, a.platform), sql`lower(${riotAccounts.gameName}) = lower(${a.gameName})`, sql`lower(${riotAccounts.tagLine}) = lower(${a.tagLine})`));
    if (row && row.playerId !== exceptPlayerId) taken.push(`${a.gameName}#${a.tagLine}`);
  }
  return taken;
}

async function insertAccounts(db: Db, playerId: string, accounts: ParsedAccount[]): Promise<void> {
  if (accounts.length === 0) return;
  await db.insert(riotAccounts).values(accounts.map((a) => ({ ownerType: "player" as const, playerId, gameName: a.gameName, tagLine: a.tagLine, platform: a.platform, label: a.label, syncStatus: "never" })));
}

function validateRole(role: unknown, label: string): Role {
  if (!ROLES.includes(role as Role)) throw new UserError(`Choose your ${label}.`);
  return role as Role;
}

/** Creates user + player profile + Riot accounts atomically. Returns the new user. */
export async function registerAccount(db: Db, input: RegisterInput): Promise<UserRecord> {
  const invalidName = validateUsername(input.username);
  if (invalidName) throw new UserError(invalidName);
  const password = input.password?.trim() ? input.password : null;
  if (password) {
    const weak = validatePasswordStrength(password);
    if (weak) throw new UserError(weak);
  }
  const primaryRole = validateRole(input.primaryRole, "main role");
  const secondaryRole = input.secondaryRole ? validateRole(input.secondaryRole, "secondary role") : null;
  if (secondaryRole === primaryRole) throw new UserError("Secondary role must differ from the main role.");
  const accounts = parseAccounts(input.primaryRiot, input.extraRiot ?? []);

  return db.transaction(async (tx) => {
    const invite = input.inviteToken ? await getValidInvite(tx, input.inviteToken) : null;
    if (input.inviteToken && !invite) throw new UserError("This invite link is invalid, used or expired.");
    const placeholderId = input.playerId ?? invite?.playerId ?? null;
    const taken = await findTakenRiotIds(tx, accounts, placeholderId);
    if (taken.length) throw new UserError(`${taken.join(", ")} ${taken.length === 1 ? "is" : "are"} already linked to another player. Ask the owner if that is your old profile.`);

    const team = await getOrCreateTeam(tx);
    let playerId: string;
    if (placeholderId) {
      const [placeholder] = await tx.select({ id: players.id }).from(players).where(and(eq(players.id, placeholderId), eq(players.teamId, team.id)));
      if (!placeholder) throw new UserError("The player profile this invite points to no longer exists. Ask the owner for a new link.");
      const [claimed] = await tx.select({ id: users.id }).from(users).where(eq(users.playerId, placeholderId));
      if (claimed) throw new UserError("That player profile is already linked to an account.");
      playerId = placeholderId;
      const primary = accounts.find((a) => a.label === "main")!;
      await tx.update(players).set({ riotId: `${primary.gameName}#${primary.tagLine}`, primaryRole, secondaryRole, updatedAt: new Date() }).where(eq(players.id, playerId));
      // Accounts the placeholder already carries stay; only genuinely new ones are added.
      const existing = await tx.select({ platform: riotAccounts.platform, gameName: riotAccounts.gameName, tagLine: riotAccounts.tagLine }).from(riotAccounts).where(eq(riotAccounts.playerId, playerId));
      const have = new Set(existing.map((e) => `${e.platform}|${e.gameName.toLowerCase()}|${e.tagLine.toLowerCase()}`));
      await insertAccounts(tx, playerId, accounts.filter((a) => !have.has(`${a.platform}|${a.gameName.toLowerCase()}|${a.tagLine.toLowerCase()}`)));
    } else {
      const [countRow] = await tx.select({ n: sql<number>`count(*)` }).from(players).where(eq(players.teamId, team.id));
      const primary = accounts.find((a) => a.label === "main")!;
      const [row] = await tx
        .insert(players)
        .values({ teamId: team.id, displayName: input.username.trim(), riotId: `${primary.gameName}#${primary.tagLine}`, primaryRole, secondaryRole, group: "main", sortOrder: Number(countRow?.n ?? 0) })
        .returning({ id: players.id });
      playerId = row!.id;
      await insertAccounts(tx, playerId, accounts);
    }

    const user = await createUser(tx, { username: input.username, password, role: invite?.role ?? input.role, playerId });
    if (invite && !(await consumeInvite(tx, invite.id, user.id))) throw new UserError("This invite link was just used by someone else.");
    return (await getUser(tx, user.id))!;
  });
}

export interface CompleteProfileInput {
  primaryRiot: RiotIdInput;
  extraRiot?: RiotIdInput[];
  primaryRole: Role;
  secondaryRole?: Role | null;
}

/**
 * One-time completion for accounts that predate automatic profiles (the original owner):
 * creates and links the player profile atomically, exactly once. A second call, or a race,
 * finds the account already linked and does nothing.
 */
export async function completeLegacyProfile(db: Db, userId: string, input: CompleteProfileInput): Promise<UserRecord> {
  const primaryRole = validateRole(input.primaryRole, "main role");
  const secondaryRole = input.secondaryRole ? validateRole(input.secondaryRole, "secondary role") : null;
  if (secondaryRole === primaryRole) throw new UserError("Secondary role must differ from the main role.");
  const accounts = parseAccounts(input.primaryRiot, input.extraRiot ?? []);
  return db.transaction(async (tx) => {
    const user = await getUser(tx, userId);
    if (!user) throw new UserError("Account not found.");
    if (user.playerId) return user; // already complete: nothing to do, no duplicate
    const taken = await findTakenRiotIds(tx, accounts, null);
    if (taken.length) throw new UserError(`${taken.join(", ")} ${taken.length === 1 ? "is" : "are"} already linked to another player.`);
    const team = await getOrCreateTeam(tx);
    const [countRow] = await tx.select({ n: sql<number>`count(*)` }).from(players).where(eq(players.teamId, team.id));
    const primary = accounts.find((a) => a.label === "main")!;
    const [row] = await tx
      .insert(players)
      .values({ teamId: team.id, displayName: user.displayName || user.username, riotId: `${primary.gameName}#${primary.tagLine}`, primaryRole, secondaryRole, group: "main", sortOrder: Number(countRow?.n ?? 0) })
      .returning({ id: players.id });
    // Link only if still unlinked: a concurrent completion loses and its profile is rolled back.
    const linked = await tx
      .update(users)
      .set({ playerId: row!.id, updatedAt: new Date() })
      .where(and(eq(users.id, userId), isNull(users.playerId)))
      .returning({ id: users.id });
    if (linked.length !== 1) throw new UserError("Your profile was just completed elsewhere. Reload the page.");
    await insertAccounts(tx, row!.id, accounts);
    return (await getUser(tx, userId))!;
  });
}
