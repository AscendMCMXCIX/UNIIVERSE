import { and, eq, isNull, sql } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { players, riotAccounts, users } from "@/server/db/schema";
import { ROLES, type Role } from "@/domain/roles";
import { parseRiotId } from "@/server/accounts/repository";
import { parsePlatforms } from "@/server/riot/api/client";
import { DEFAULT_RIOT_PLATFORM, isRiotPlatform } from "@/domain/riot-platforms";
import { getOrCreateTeam } from "@/server/repositories/team";
import { createUser, getUser, UserError, validateUsername, type UserRecord } from "@/server/repositories/users";
import { validatePasswordStrength } from "./password";
import type { AccessRole } from "./permissions";

/**
 * First-run owner creation (`registerAccount`, used by /setup) and the one-time completion of
 * accounts that predate player profiles. Player accounts are created by admins in
 * auth/account-admin.ts after Riot verifies the Riot ID; nobody can register themselves.
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
    const taken = await findTakenRiotIds(tx, accounts, null);
    if (taken.length) throw new UserError(`${taken.join(", ")} ${taken.length === 1 ? "is" : "are"} already linked to another player.`);
    const team = await getOrCreateTeam(tx);
    const [countRow] = await tx.select({ n: sql<number>`count(*)` }).from(players).where(eq(players.teamId, team.id));
    const primary = accounts.find((a) => a.label === "main")!;
    const [row] = await tx
      .insert(players)
      .values({ teamId: team.id, displayName: input.username.trim(), riotId: `${primary.gameName}#${primary.tagLine}`, primaryRole, secondaryRole, group: "main", sortOrder: Number(countRow?.n ?? 0) })
      .returning({ id: players.id });
    await insertAccounts(tx, row!.id, accounts);
    const user = await createUser(tx, { username: input.username, password, role: input.role, playerId: row!.id });
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
