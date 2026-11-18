import { and, eq, sql } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { players, riotAccounts, users } from "@/server/db/schema";
import { parseRiotId } from "@/server/accounts/repository";
import { isRiotPlatform } from "@/domain/riot-platforms";
import { createRiotClient, RiotApiError } from "@/server/riot/api/client";
import { ERASED_IDENTITY_MESSAGE, erasureFilter } from "@/server/privacy/ledger";
import { browserTestRiot } from "@/server/riot/browser-test";

/** The Riot calls account verification needs; the real client satisfies it, tests pass a fake. */
export interface RiotIdentityClient {
  accountByRiotId(platform: string, gameName: string, tagLine: string): Promise<{ puuid: string; gameName?: string; tagLine?: string }>;
  activePlatformByPuuid(platformHint: string, puuid: string): Promise<string | null>;
}

export type IdentityCheck =
  | { status: "verified"; puuid: string; gameName: string; tagLine: string; riotId: string; platform: string; platformConfirmed: boolean; reuseArchivedPlayerId: string | null }
  | { status: "invalid"; message: string }
  | { status: "not-found"; message: string }
  | { status: "duplicate"; message: string }
  /** The Riot account of someone whose personal data was erased: not linked again unless an administrator releases it. */
  | { status: "erased"; message: string }
  | { status: "unavailable"; message: string }
  | { status: "failed"; message: string };

/** What Riot answers about a typed Riot ID (lookupRiotId): the account under Riot's own spelling, or why there is none. */
export type RiotIdLookup = { status: "found"; puuid: string; gameName: string; tagLine: string; riotId: string } | Extract<IdentityCheck, { status: "invalid" | "not-found" | "unavailable" | "failed" }>;

/**
 * Interactive verification: a couple of quick attempts, never the background jobs' long backoff.
 * With a `deadline` (linking a Riot ID to a profile: actions/accounts.ts), no request starts after
 * it and none waits past it for Riot's rate limits; such a wait is answered as Riot being busy.
 */
export function createVerificationClient(options: { deadline?: number } = {}): RiotIdentityClient | null {
  if (browserTestRiot()) return BROWSER_TEST_RIOT;
  return createRiotClient({ maxRetries: 1, timeoutMs: 8_000, deadline: options.deadline });
}

/**
 * Browser tests only (server/riot/browser-test.ts): every well-formed Riot ID "exists", so account
 * creation can be tested end to end without a Riot key. Real data never meets this client.
 */
const BROWSER_TEST_RIOT: RiotIdentityClient = {
  async accountByRiotId(_platform, gameName, tagLine) {
    return { puuid: `browser-test-${gameName.toLowerCase()}-${tagLine.toLowerCase()}`, gameName, tagLine };
  },
  async activePlatformByPuuid() {
    return null;
  },
};

/**
 * Whether a typed Riot ID names a real Riot account, and which: the format, then Riot's ACCOUNT-V1
 * answer (names are sent exactly as typed, full Unicode, URL-encoded), under Riot's own spelling.
 * When Riot cannot be asked right now (no key, a refused key, a rate limit, Riot down or
 * unreachable) the answer says so and to try again; nothing stands in for Riot's answer. The first
 * half of verifyRiotIdentity; linking a Riot ID to a profile asks Riot the same way, with the same
 * messages (actions/accounts.ts).
 */
export async function lookupRiotId(riotIdInput: string, client: RiotIdentityClient | null, options: { platformHint: string }): Promise<RiotIdLookup> {
  const parsed = parseRiotId(riotIdInput);
  if (!parsed) return { status: "invalid", message: "Enter the Riot ID exactly as shown in the League client: GameName#TAG." };
  if (!client) return { status: "unavailable", message: "Riot verification is not available: the server has no Riot API key configured. Try again once an administrator has set one." };
  let account: { puuid: string; gameName?: string; tagLine?: string };
  try {
    account = await client.accountByRiotId(options.platformHint, parsed.gameName, parsed.tagLine);
  } catch (err) {
    if (err instanceof RiotApiError) {
      if (err.status === 404) return { status: "not-found", message: `Riot has no account named ${parsed.gameName}#${parsed.tagLine}. Check the spelling and the #TAG.` };
      if (err.status === 401 || err.status === 403) return { status: "unavailable", message: "Riot service unavailable: Riot rejected the server's API key. An admin needs to replace RIOT_API_KEY; try again once they have." };
      if (err.status === 429 || err.status === 0 || err.status >= 500) return { status: "unavailable", message: "Riot service unavailable right now (busy or unreachable). Try again in a minute." };
      return { status: "failed", message: `Verification failed (Riot answered ${err.status}). Try again.` };
    }
    return { status: "failed", message: "Verification failed. Try again." };
  }
  const gameName = account.gameName?.trim() || parsed.gameName;
  const tagLine = account.tagLine?.trim() || parsed.tagLine;
  return { status: "found", puuid: account.puuid, gameName, tagLine, riotId: `${gameName}#${tagLine}` };
}

/**
 * Checks that a Riot ID names a real Riot account before an admin may create a player for it:
 * Riot's answer (lookupRiotId), and that the PUUID or the Riot ID is not already a UNIIVERSE
 * player. A profile that was archived when its account was deleted is offered for reuse instead
 * of a duplicate. Match history, mastery and proficiency are left to the background sync.
 */
export async function verifyRiotIdentity(db: Db, riotIdInput: string, client: RiotIdentityClient | null, options: { platformHint: string }): Promise<IdentityCheck> {
  const found = await lookupRiotId(riotIdInput, client, options);
  if (found.status !== "found") return found;
  const { puuid, gameName, tagLine, riotId } = found;
  const erased = await erasureFilter(db);
  if (erased.puuid(puuid) || erased.riotId(riotId)) return { status: "erased", message: ERASED_IDENTITY_MESSAGE };

  // Duplicates: the same Riot identity (by PUUID, or by name for accounts never resolved) on another profile.
  const owners = await db
    .select({ playerId: riotAccounts.playerId, ownerType: riotAccounts.ownerType, archivedAt: players.archivedAt, displayName: players.displayName, userId: users.id })
    .from(riotAccounts)
    .leftJoin(players, eq(players.id, riotAccounts.playerId))
    .leftJoin(users, eq(users.playerId, riotAccounts.playerId))
    .where(sql`${riotAccounts.puuid} = ${puuid} OR (${riotAccounts.puuid} IS NULL AND lower(${riotAccounts.gameName}) = lower(${gameName}) AND lower(${riotAccounts.tagLine}) = lower(${tagLine}))`);
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
    // Riot answered the lookup, so there is a client.
    const active = await client!.activePlatformByPuuid(options.platformHint, puuid);
    if (active && isRiotPlatform(active.toLowerCase())) {
      platform = active.toLowerCase();
      platformConfirmed = true;
    }
  } catch {
    // The server is a convenience; the background sync confirms it later.
  }
  return { status: "verified", puuid, gameName, tagLine, riotId, platform, platformConfirmed, reuseArchivedPlayerId: reuse };
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
