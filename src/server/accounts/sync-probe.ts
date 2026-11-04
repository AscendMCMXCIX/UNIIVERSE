import { and, eq, sql } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { riotAccounts } from "@/server/db/schema";
import { RiotApiError, RiotDeadlineError, type RiotApiClient } from "@/server/riot/api/client";
import { accountRegionFor, isRiotPlatform, regionFor } from "@/domain/riot-platforms";
import { erasureFilter } from "@/server/privacy/ledger";

/**
 * The requests an account sync makes (syncAccount), each asked once, on the routing host the sync
 * uses, for one linked account per server in use; nothing is stored. The Riot key check runs it
 * before it clears a recorded refusal: Riot refusing one API, or one routing host (as the sea host
 * refused ACCOUNT-V1 before account lookups moved to asia), fails every sync exactly as a rejected
 * key does, while platform status still answers. The labels name an API and a host, never an
 * account: they reach job logs and the Data health page. Bounded by the client's deadline (the
 * key check's, riotKeyCheckLimits): asking stops at the first request the deadline refuses.
 */
export interface SyncProbe {
  /** Linked accounts asked about (one per server in use, at most MAX_SERVERS). */
  accounts: number;
  /** The first request Riot refused (401/403). Asking stops there. */
  refused: { request: string; error: RiotApiError } | null;
  /** Requests that failed in another way (no answer, or another answer), in order. */
  failures: Array<{ request: string; error: unknown }>;
  /**
   * The request the check could not finish in time (RiotDeadlineError): its deadline came, or
   * Riot's rate limits would have kept it waiting past it (a 429's Retry-After, possibly Riot's
   * answer to this very request). Asking stops there: neither it nor the requests after it got an
   * answer that says anything about the key.
   */
  outOfTime: string | null;
}

/** Servers asked about in one probe (with seven requests each at most). */
const MAX_SERVERS = 4;

const isRefusal = (err: unknown): err is RiotApiError => err instanceof RiotApiError && (err.status === 401 || err.status === 403);

export async function probeSyncRequests(db: Db, client: RiotApiClient): Promise<SyncProbe> {
  // The accounts the sync works through (accountsForSyncRun); the ones waiting first, as a refusal
  // leaves them Pending, then the ones with a PUUID, which the sync asks the most about.
  const rows = await db
    .select({ platform: riotAccounts.platform, puuid: riotAccounts.puuid, gameName: riotAccounts.gameName, tagLine: riotAccounts.tagLine })
    .from(riotAccounts)
    .where(and(eq(riotAccounts.ownerType, "player"), sql`${riotAccounts.label} <> 'demo'`, sql`${riotAccounts.syncStatus} <> 'demo'`))
    .orderBy(sql`(${riotAccounts.syncStatus} = 'pending') DESC`, sql`(${riotAccounts.puuid} IS NOT NULL) DESC`, sql`${riotAccounts.lastSyncAt} DESC NULLS LAST`);
  // As in the sync: an erased person's account is never read from Riot again.
  const erased = await erasureFilter(db);
  const byServer = new Map<string, (typeof rows)[number]>();
  for (const row of rows) {
    const platform = row.platform.toLowerCase();
    if (byServer.has(platform) || !isRiotPlatform(platform) || erased.puuid(row.puuid) || erased.riotId(`${row.gameName}#${row.tagLine}`)) continue;
    byServer.set(platform, row);
    if (byServer.size >= MAX_SERVERS) break;
  }

  const probe: SyncProbe = { accounts: byServer.size, refused: null, failures: [], outOfTime: null };
  /** Asks one request; false once Riot refused it or the deadline did (nothing more is asked). */
  const ask = async (request: string, run: () => Promise<unknown>): Promise<boolean> => {
    try {
      await run();
    } catch (err) {
      if (err instanceof RiotDeadlineError) {
        probe.outOfTime = request;
        return false;
      }
      if (isRefusal(err)) {
        probe.refused = { request, error: err };
        return false;
      }
      probe.failures.push({ request, error: err });
    }
    return true;
  };
  for (const [platform, account] of byServer) {
    const accountHost = accountRegionFor(platform);
    const matchHost = regionFor(platform);
    let puuid = account.puuid;
    // Resolving a Riot ID (an account not resolved yet); its answer gives the PUUID when none is stored.
    const resolved = await ask(`ACCOUNT-V1 by Riot ID on ${accountHost}`, async () => {
      const found = await client.accountByRiotId(platform, account.gameName, account.tagLine);
      if (!erased.puuid(found.puuid)) puuid ??= found.puuid;
    });
    if (!resolved) return probe;
    if (!puuid) continue;
    const id = puuid;
    let matchId: string | undefined;
    const requests: Array<[string, () => Promise<unknown>]> = [
      [`ACCOUNT-V1 by PUUID on ${accountHost}`, () => client.accountByPuuid(platform, id)],
      [`ACCOUNT-V1 active server on ${accountHost}`, () => client.activePlatformByPuuid(platform, id)],
      [`LEAGUE-V4 entries on ${platform}`, () => client.leagueEntriesByPuuid(platform, id)],
      [`CHAMPION-MASTERY-V4 on ${platform}`, () => client.championMasteries(platform, id)],
      [`MATCH-V5 match list on ${matchHost}`, async () => (matchId = (await client.matchIdsByPuuid(platform, id, { count: 1 }))[0])],
      [`MATCH-V5 match on ${matchHost}`, async () => (matchId ? client.match(platform, matchId) : undefined)],
    ];
    for (const [request, run] of requests) if (!(await ask(request, run))) return probe;
  }
  return probe;
}
