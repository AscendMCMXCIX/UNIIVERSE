import { and, eq, sql } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { players, riotAccounts, users } from "@/server/db/schema";
import { parseRiotId } from "@/server/accounts/repository";
import { isRiotPlatform } from "@/domain/riot-platforms";
import { createRiotClient, RiotApiError } from "@/server/riot/api/client";

/** The Riot calls account verification needs; the real client satisfies it, tests pass a fake. */
export interface RiotIdentityClient {
  accountByRiotId(platform: string, gameName: string, tagLine: string): Promise<{ puuid: string; gameName?: string; tagLine?: string }>;
  activePlatformByPuuid(platformHint: string, puuid: string): Promise<string | null>;
  /** An account's Riot ID as it is now (Clash Scout shows a candidate under its current Riot ID, never an older one). */
  accountByPuuid?(platform: string, puuid: string): Promise<{ puuid: string; gameName?: string; tagLine?: string }>;
}

export type IdentityCheck =
  | { status: "verified"; puuid: string; gameName: string; tagLine: string; riotId: string; platform: string; platformConfirmed: boolean; reuseArchivedPlayerId: string | null }
  | { status: "invalid"; message: string }
  | { status: "not-found"; message: string }
  | { status: "duplicate"; message: string }
  | { status: "unavailable"; message: string }
  | { status: "failed"; message: string };

/** Interactive verification: a couple of quick attempts, never the background jobs' long backoff. */
export function createVerificationClient(): RiotIdentityClient | null {
  if (browserTestRiot()) return BROWSER_TEST_RIOT;
  return createRiotClient({ maxRetries: 1, timeoutMs: 8_000 });
}

/**
 * Browser tests only: with UNIIVERSE_FAKE_RIOT_IDS=1 on the in-memory demo database (never a real
 * database, never a deployment), every well-formed Riot ID "exists", so account creation can be
 * tested end to end without a Riot key. Real data never meets this client.
 */
function browserTestRiot(): boolean {
  return process.env.UNIIVERSE_FAKE_RIOT_IDS === "1" && process.env.UNIIVERSE_DB_MODE === "memory" && !process.env.VERCEL;
}

const BROWSER_TEST_RIOT: RiotIdentityClient = {
  async accountByRiotId(_platform, gameName, tagLine) {
    return { puuid: `browser-test-${gameName.toLowerCase()}-${tagLine.toLowerCase()}`, gameName, tagLine };
  },
  // The stand-in's accounts are named in their PUUID ("browser-test-<name>-<tag>"); anything else does not exist.
  async accountByPuuid(_platform, puuid) {
    const m = /^browser-test-(.+)-([^-]+)$/.exec(puuid);
    if (!m) throw new RiotApiError("Not found", 404, false);
    return { puuid, gameName: m[1], tagLine: m[2]!.toUpperCase() };
  },
  async activePlatformByPuuid() {
    return null;
  },
};

/**
 * Checks that a Riot ID names a real Riot account before an admin may create a player for it:
 * the format, Riot's ACCOUNT-V1 resolution to a PUUID (names are sent exactly as typed, full
 * Unicode, URL-encoded), and that the PUUID or the Riot ID is not already a UNIIVERSE player. A
 * profile that was archived when its account was deleted is offered for reuse instead of a
 * duplicate. Match history, mastery and proficiency are left to the background sync.
 */
export async function verifyRiotIdentity(db: Db, riotIdInput: string, client: RiotIdentityClient | null, options: { platformHint: string }): Promise<IdentityCheck> {
  const parsed = parseRiotId(riotIdInput);
  if (!parsed) return { status: "invalid", message: "Enter the Riot ID exactly as shown in the League client: GameName#TAG." };
  if (!client) return { status: "unavailable", message: "Riot verification is not available: the server has no Riot API key configured." };
  let account: { puuid: string; gameName?: string; tagLine?: string };
  try {
    account = await client.accountByRiotId(options.platformHint, parsed.gameName, parsed.tagLine);
  } catch (err) {
    if (err instanceof RiotApiError) {
      if (err.status === 404) return { status: "not-found", message: `Riot has no account named ${parsed.gameName}#${parsed.tagLine}. Check the spelling and the #TAG.` };
      if (err.status === 401 || err.status === 403) return { status: "unavailable", message: "Riot service unavailable: Riot rejected the server's API key. An admin needs to replace RIOT_API_KEY." };
      if (err.status === 429 || err.status === 0 || err.status >= 500) return { status: "unavailable", message: "Riot service unavailable right now (busy or unreachable). Try again in a minute." };
      return { status: "failed", message: `Verification failed (Riot answered ${err.status}). Try again.` };
    }
    return { status: "failed", message: "Verification failed. Try again." };
  }
  const gameName = account.gameName?.trim() || parsed.gameName;
  const tagLine = account.tagLine?.trim() || parsed.tagLine;
  const riotId = `${gameName}#${tagLine}`;

  // Duplicates: the same Riot identity (by PUUID, or by name for accounts never resolved) on another profile.
  const owners = await db
    .select({ playerId: riotAccounts.playerId, ownerType: riotAccounts.ownerType, archivedAt: players.archivedAt, displayName: players.displayName, userId: users.id })
    .from(riotAccounts)
    .leftJoin(players, eq(players.id, riotAccounts.playerId))
    .leftJoin(users, eq(users.playerId, riotAccounts.playerId))
    .where(sql`${riotAccounts.puuid} = ${account.puuid} OR (${riotAccounts.puuid} IS NULL AND lower(${riotAccounts.gameName}) = lower(${gameName}) AND lower(${riotAccounts.tagLine}) = lower(${tagLine}))`);
  let reuse: string | null = null;
  for (const o of owners) {
    if (o.ownerType === "opponent") continue; // opponents are scouting data, not people with accounts
    if (o.playerId && o.archivedAt && !o.userId) {
      reuse = o.playerId;
      continue;
    }
    return { status: "duplicate", message: `${riotId} already belongs to ${o.displayName ? `the player ${o.displayName}` : "another player"}.` };
  }

  let platform = options.platformHint;
  let platformConfirmed = false;
  try {
    const active = await client.activePlatformByPuuid(options.platformHint, account.puuid);
    if (active && isRiotPlatform(active.toLowerCase())) {
      platform = active.toLowerCase();
      platformConfirmed = true;
    }
  } catch {
    // The server is a convenience; the background sync confirms it later.
  }
  return { status: "verified", puuid: account.puuid, gameName, tagLine, riotId, platform, platformConfirmed, reuseArchivedPlayerId: reuse };
}

/** Archived, account-less profile owning a Riot account (checked again inside the creation transaction). */
export async function archivedProfileForPuuid(db: Db, puuid: string): Promise<string | null> {
  const [row] = await db
    .select({ playerId: riotAccounts.playerId })
    .from(riotAccounts)
    .innerJoin(players, eq(players.id, riotAccounts.playerId))
    .leftJoin(users, eq(users.playerId, riotAccounts.playerId))
    .where(and(eq(riotAccounts.puuid, puuid), sql`${players.archivedAt} IS NOT NULL`, sql`${users.id} IS NULL`));
  return row?.playerId ?? null;
}
