import { and, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { accountChampionHistory, accountMastery, accountMatches, champions, riotAccounts } from "@/server/db/schema";
import { RiotApiError, type RiotApiClient } from "@/server/riot/api/client";
import type { RiotMatch } from "@/server/riot/api/schemas";
import { patchFromVersion } from "@/domain/patch";
import { RIOT_POSITION_TO_ROLE } from "@/domain/roles";
import type { RiotAccountRecord } from "./repository";

export function queueGroupFor(queueId: number): "solo" | "flex" | "normal" | "other" {
  if (queueId === 420) return "solo";
  if (queueId === 440) return "flex";
  if (queueId === 400 || queueId === 430 || queueId === 490) return "normal";
  return "other";
}

export interface AccountSyncResult {
  accountId: string;
  resolved: boolean;
  matchesFetched: number;
  matchesFolded: number;
  masteryRows: number;
  rankUpdated: boolean;
  error?: string;
}

export interface AccountSyncOptions {
  lookbackDays?: number;
  maxMatchesPerRun?: number;
  outOfTime?: () => boolean;
  log?: (m: string) => void;
  /** Queue ids worth folding into history (default: solo, flex, normals, clash). */
  queueIds?: number[];
}

/**
 * Incrementally synchronises one linked Riot account:
 *   1. resolve the PUUID from the Riot ID when unknown,
 *   2. refresh rank + champion mastery,
 *   3. fetch new match ids since the account's cursor, skip ones already folded,
 *   4. fold each match's participant row for this PUUID into champion history.
 * Everything is idempotent (account_matches is the dedupe ledger) and budget-aware.
 */
export async function syncAccount(db: Db, client: RiotApiClient, account: RiotAccountRecord, options: AccountSyncOptions = {}): Promise<AccountSyncResult> {
  const log = options.log ?? (() => {});
  const result: AccountSyncResult = { accountId: account.id, resolved: !!account.puuid, matchesFetched: 0, matchesFolded: 0, masteryRows: 0, rankUpdated: false };
  const queueIds = options.queueIds ?? [420, 440, 400, 430, 490, 700];
  let puuid = account.puuid;
  try {
    if (!puuid) {
      const acc = await client.accountByRiotId(account.platform, account.gameName, account.tagLine);
      puuid = acc.puuid;
      // Another linked account may already own this PUUID (same player, renamed Riot ID).
      const [clash] = await db.select({ id: riotAccounts.id }).from(riotAccounts).where(and(eq(riotAccounts.puuid, puuid), sql`${riotAccounts.id} <> ${account.id}`));
      if (clash) {
        await db.update(riotAccounts).set({ syncStatus: "failed", syncError: "This Riot ID resolves to a PUUID already linked elsewhere (duplicate account).", lastSyncAt: new Date() }).where(eq(riotAccounts.id, account.id));
        return { ...result, error: "duplicate PUUID" };
      }
      // Adopt Riot's canonical spelling unless another stored account already uses it.
      let gameName = acc.gameName ?? account.gameName;
      let tagLine = acc.tagLine ?? account.tagLine;
      const [nameClash] = await db
        .select({ id: riotAccounts.id })
        .from(riotAccounts)
        .where(and(eq(riotAccounts.platform, account.platform), eq(riotAccounts.gameName, gameName), eq(riotAccounts.tagLine, tagLine), sql`${riotAccounts.id} <> ${account.id}`));
      if (nameClash) {
        gameName = account.gameName;
        tagLine = account.tagLine;
      }
      await db.update(riotAccounts).set({ puuid, gameName, tagLine }).where(eq(riotAccounts.id, account.id));
      result.resolved = true;
    }

    // Rank snapshot (solo queue preferred, flex as fallback) and mastery.
    try {
      const entries = await client.leagueEntriesByPuuid(account.platform, puuid);
      const solo = entries.find((e) => e.queueType === "RANKED_SOLO_5x5") ?? entries.find((e) => e.queueType === "RANKED_FLEX_SR");
      if (solo) {
        await db
          .update(riotAccounts)
          .set({ tier: solo.tier ?? null, division: solo.rank ?? null, leaguePoints: solo.leaguePoints, rankedWins: solo.wins, rankedLosses: solo.losses, rankUpdatedAt: new Date() })
          .where(eq(riotAccounts.id, account.id));
        result.rankUpdated = true;
      }
    } catch (err) {
      log(`rank lookup failed for ${account.gameName}: ${(err as Error).message}`);
    }
    try {
      const masteries = await client.championMasteries(account.platform, puuid);
      const keyToId = new Map((await db.select({ key: champions.key, id: champions.id }).from(champions)).map((c) => [c.key, c.id]));
      const rows = masteries
        .map((m) => ({ accountId: account.id, championId: keyToId.get(m.championId), points: m.championPoints, level: m.championLevel, lastPlayedAt: m.lastPlayTime ? new Date(m.lastPlayTime) : null }))
        .filter((r): r is typeof r & { championId: string } => !!r.championId);
      for (let i = 0; i < rows.length; i += 200) {
        await db
          .insert(accountMastery)
          .values(rows.slice(i, i + 200))
          .onConflictDoUpdate({ target: [accountMastery.accountId, accountMastery.championId], set: { points: sql`excluded.points`, level: sql`excluded.level`, lastPlayedAt: sql`excluded.last_played_at` } });
      }
      result.masteryRows = rows.length;
    } catch (err) {
      log(`mastery lookup failed for ${account.gameName}: ${(err as Error).message}`);
    }

    // Matches since the cursor.
    const lookback = Math.floor(Date.now() / 1000) - (options.lookbackDays ?? 120) * 86_400;
    const startTime = account.puuid && (await cursorFor(db, account.id)) ? Math.max(lookback, (await cursorFor(db, account.id))! - 3600) : lookback;
    const ids = await client.allMatchIdsByPuuid(account.platform, puuid, { startTime, count: Math.min(100, options.maxMatchesPerRun ?? 60) });
    const known = new Set((await db.select({ matchId: accountMatches.matchId }).from(accountMatches).where(and(eq(accountMatches.accountId, account.id), inArray(accountMatches.matchId, ids.length ? ids : ["-"])))).map((r) => r.matchId));
    const keyToId = new Map((await db.select({ key: champions.key, id: champions.id }).from(champions)).map((c) => [c.key, c.id]));
    for (const matchId of ids) {
      if (options.outOfTime?.()) break;
      if (known.has(matchId)) continue;
      let match: RiotMatch;
      try {
        match = await client.match(account.platform, matchId);
      } catch (err) {
        if (err instanceof RiotApiError && (err.status === 403 || err.status === 401)) throw err;
        log(`match ${matchId} failed: ${(err as Error).message}`);
        continue;
      }
      result.matchesFetched += 1;
      if (!queueIds.includes(match.info.queueId) || match.info.gameDuration < 300) {
        await db.insert(accountMatches).values({ accountId: account.id, matchId, gameCreation: match.info.gameCreation }).onConflictDoNothing();
        continue;
      }
      const me = match.info.participants.find((p) => p.puuid === puuid);
      if (!me) continue;
      const championId = keyToId.get(me.championId);
      if (!championId) continue;
      const patch = patchFromVersion(match.info.gameVersion) ?? "unknown";
      const role = RIOT_POSITION_TO_ROLE[me.teamPosition] ?? "UNKNOWN";
      const playedAt = new Date(match.info.gameCreation);
      await db.transaction(async (tx) => {
        const inserted = await tx.insert(accountMatches).values({ accountId: account.id, matchId, gameCreation: match.info.gameCreation }).onConflictDoNothing().returning({ id: accountMatches.matchId });
        if (inserted.length === 0) return;
        await tx
          .insert(accountChampionHistory)
          .values({ accountId: account.id, championId, role, queueGroup: queueGroupFor(match.info.queueId), patch, games: 1, wins: me.win ? 1 : 0, kills: me.kills, deaths: me.deaths, assists: me.assists, lastPlayedAt: playedAt })
          .onConflictDoUpdate({
            target: [accountChampionHistory.accountId, accountChampionHistory.championId, accountChampionHistory.role, accountChampionHistory.queueGroup, accountChampionHistory.patch],
            set: {
              games: sql`${accountChampionHistory.games} + 1`,
              wins: sql`${accountChampionHistory.wins} + ${me.win ? 1 : 0}`,
              kills: sql`${accountChampionHistory.kills} + ${me.kills}`,
              deaths: sql`${accountChampionHistory.deaths} + ${me.deaths}`,
              assists: sql`${accountChampionHistory.assists} + ${me.assists}`,
              lastPlayedAt: sql`GREATEST(${accountChampionHistory.lastPlayedAt}, ${playedAt.toISOString()}::timestamptz)`,
            },
          });
        result.matchesFolded += 1;
      });
    }
    await db.update(riotAccounts).set({ lastSyncAt: new Date(), syncStatus: "ok", syncError: null, syncCursor: Math.floor(Date.now() / 1000), updatedAt: new Date() }).where(eq(riotAccounts.id, account.id));
    return result;
  } catch (err) {
    const message = err instanceof RiotApiError && err.status === 404 ? "Riot ID not found. Check spelling, tag and region." : (err as Error).message;
    await db.update(riotAccounts).set({ lastSyncAt: new Date(), syncStatus: err instanceof RiotApiError && err.status === 404 ? "unresolved" : "failed", syncError: message, updatedAt: new Date() }).where(eq(riotAccounts.id, account.id));
    return { ...result, error: message };
  }
}

async function cursorFor(db: Db, accountId: string): Promise<number | null> {
  const [row] = await db.select({ cursor: riotAccounts.syncCursor }).from(riotAccounts).where(eq(riotAccounts.id, accountId));
  return row?.cursor ?? null;
}
