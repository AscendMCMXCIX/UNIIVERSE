import { and, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { accountChampionHistory, accountMastery, accountMatches, champions, players, riotAccounts } from "@/server/db/schema";
import { RiotApiError, type RiotApiClient } from "@/server/riot/api/client";
import type { RiotMatch } from "@/server/riot/api/schemas";
import { patchFromVersion } from "@/domain/patch";
import { normaliseRiotRegionAnswer, platformLabel } from "@/domain/riot-platforms";
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
  /** Platform in use after the run (Riot's answer when available, else the player's selection). */
  platform: string;
  platformSource: "user" | "riot";
  matchesFetched: number;
  matchesFolded: number;
  masteryRows: number;
  rankUpdated: boolean;
  /** Plain-language problem, when the run did not complete. */
  error?: string;
  /** Stored sync status after the run. */
  status: "ok" | "pending" | "unresolved" | "failed";
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
 * Plain-language cause of a failed account request. Teammates read these on their profile, so no
 * HTTP codes or routes: what happened and whether anything is expected of them.
 */
export function friendlyAccountError(err: unknown, context: "resolve" | "sync" = "sync"): { message: string; status: "pending" | "unresolved" | "failed" } {
  if (err instanceof RiotApiError) {
    switch (err.status) {
      case 404:
        return context === "resolve"
          ? { message: "Riot could not find this Riot ID. Check the spelling and the #TAG exactly as shown in the League client, then save it again.", status: "unresolved" }
          : { message: "Riot has no League data for this account on the selected server yet. It is checked again on the next sync.", status: "pending" };
      case 401:
      case 403:
        return { message: "The server's Riot API key was rejected, so Riot could not be asked. Your account is saved and syncs automatically once the owner updates the key.", status: "pending" };
      case 429:
        return { message: "Riot is rate-limiting requests right now. Your account is saved and retried automatically.", status: "pending" };
      case 400:
        return { message: "Riot did not accept the request for this account. It is retried automatically; if this persists, remove and re-add the account.", status: "pending" };
      case 0:
        return { message: "Riot's servers did not answer. Your account is saved and retried automatically.", status: "pending" };
      default:
        return err.status >= 500 ? { message: "Riot's servers are having trouble. Your account is saved and retried automatically.", status: "pending" } : { message: "Riot answered in an unexpected way. Your account is saved and retried automatically.", status: "pending" };
    }
  }
  const text = (err as Error)?.message ?? String(err);
  if (/Unexpected response shape/i.test(text)) return { message: "Riot answered in an unexpected format. Your account is saved and retried automatically.", status: "pending" };
  return { message: "Something went wrong while talking to Riot. Your account is saved and retried automatically.", status: "pending" };
}

/**
 * Incrementally synchronises one linked Riot account:
 *   1. resolve the PUUID from the Riot ID when unknown (ACCOUNT-V1), adopt Riot's spelling,
 *   2. ask Riot which server the account actively plays on; fall back to the player's selection,
 *   3. refresh rank + champion mastery,
 *   4. fetch new match ids since the account's cursor, skip ones already folded,
 *   5. fold each match's participant row for this PUUID into champion history.
 * Everything is idempotent (account_matches is the dedupe ledger) and budget-aware. Riot being
 * unavailable never throws: the account is marked pending and retried by the next job run.
 */
export async function syncAccount(db: Db, client: RiotApiClient, account: RiotAccountRecord, options: AccountSyncOptions = {}): Promise<AccountSyncResult> {
  const log = options.log ?? (() => {});
  let platform = account.platform;
  let platformSource: "user" | "riot" = account.platformSource === "riot" ? "riot" : "user";
  const result: AccountSyncResult = { accountId: account.id, resolved: !!account.puuid, platform, platformSource, matchesFetched: 0, matchesFolded: 0, masteryRows: 0, rankUpdated: false, status: "ok" };
  const queueIds = options.queueIds ?? [420, 440, 400, 430, 490, 700];
  let puuid = account.puuid;
  const fail = async (err: unknown, context: "resolve" | "sync"): Promise<AccountSyncResult> => {
    const f = friendlyAccountError(err, context);
    await db
      .update(riotAccounts)
      .set({ lastSyncAt: new Date(), syncStatus: f.status, syncError: f.message, resolveAttempts: sql`${riotAccounts.resolveAttempts} + 1`, updatedAt: new Date() })
      .where(eq(riotAccounts.id, account.id));
    log(`${account.gameName}#${account.tagLine}: ${f.message} (${(err as Error)?.message ?? err})`);
    return { ...result, error: f.message, status: f.status };
  };

  try {
    if (!puuid) {
      let acc;
      try {
        acc = await client.accountByRiotId(platform, account.gameName, account.tagLine);
      } catch (err) {
        return fail(err, "resolve");
      }
      puuid = acc.puuid;
      // Another linked account may already own this PUUID (same player, renamed Riot ID).
      const [clash] = await db.select({ id: riotAccounts.id, gameName: riotAccounts.gameName, tagLine: riotAccounts.tagLine, playerId: riotAccounts.playerId }).from(riotAccounts).where(and(eq(riotAccounts.puuid, puuid), sql`${riotAccounts.id} <> ${account.id}`));
      if (clash) {
        const message = clash.playerId === account.playerId ? `This is the same Riot account as ${clash.gameName}#${clash.tagLine}, which is already linked (renamed Riot ID). Remove one of the two; games are only ever counted once.` : `This Riot account is already linked to another player as ${clash.gameName}#${clash.tagLine}. Ask the owner to move it.`;
        await db.update(riotAccounts).set({ syncStatus: "failed", syncError: message, lastSyncAt: new Date(), updatedAt: new Date() }).where(eq(riotAccounts.id, account.id));
        return { ...result, error: message, status: "failed" };
      }
      // Adopt Riot's canonical spelling unless another stored account already uses it.
      let gameName = acc.gameName ?? account.gameName;
      let tagLine = acc.tagLine ?? account.tagLine;
      const [nameClash] = await db
        .select({ id: riotAccounts.id })
        .from(riotAccounts)
        .where(and(eq(riotAccounts.platform, platform), eq(riotAccounts.gameName, gameName), eq(riotAccounts.tagLine, tagLine), sql`${riotAccounts.id} <> ${account.id}`));
      if (nameClash) {
        gameName = account.gameName;
        tagLine = account.tagLine;
      }
      await db.update(riotAccounts).set({ puuid, gameName, tagLine, puuidResolvedAt: new Date(), resolveAttempts: 0, updatedAt: new Date() }).where(eq(riotAccounts.id, account.id));
      if (account.label === "main" && account.playerId && (gameName !== account.gameName || tagLine !== account.tagLine)) {
        await db.update(players).set({ riotId: `${gameName}#${tagLine}`, updatedAt: new Date() }).where(eq(players.id, account.playerId));
      }
      result.resolved = true;
    }

    // Which server does the account actually play on? Riot knows; the selector was a hint.
    if (platformSource !== "riot") {
      try {
        const answer = normaliseRiotRegionAnswer(await client.activePlatformByPuuid(platform, puuid));
        if (answer) {
          if (answer !== platform) log(`${account.gameName}#${account.tagLine}: Riot says ${platformLabel(answer)}, not ${platformLabel(platform)}; following Riot`);
          platform = answer;
          platformSource = "riot";
          await db.update(riotAccounts).set({ platform, platformSource: "riot", updatedAt: new Date() }).where(eq(riotAccounts.id, account.id));
        } else {
          log(`${account.gameName}#${account.tagLine}: Riot did not report an active server; keeping ${platformLabel(platform)}`);
        }
      } catch (err) {
        if (err instanceof RiotApiError && (err.status === 401 || err.status === 403)) throw err;
        log(`${account.gameName}#${account.tagLine}: active-server lookup unavailable (${(err as Error).message}); keeping ${platformLabel(platform)}`);
      }
    }
    result.platform = platform;
    result.platformSource = platformSource;

    // Rank snapshot (solo queue preferred, flex as fallback) and mastery.
    try {
      const entries = await client.leagueEntriesByPuuid(platform, puuid);
      const solo = entries.find((e) => e.queueType === "RANKED_SOLO_5x5") ?? entries.find((e) => e.queueType === "RANKED_FLEX_SR");
      if (solo) {
        await db
          .update(riotAccounts)
          .set({ tier: solo.tier ?? null, division: solo.rank ?? null, leaguePoints: solo.leaguePoints, rankedWins: solo.wins, rankedLosses: solo.losses, rankUpdatedAt: new Date() })
          .where(eq(riotAccounts.id, account.id));
        result.rankUpdated = true;
      }
    } catch (err) {
      if (err instanceof RiotApiError && (err.status === 401 || err.status === 403)) throw err;
      log(`rank lookup failed for ${account.gameName}: ${(err as Error).message}`);
    }
    try {
      const masteries = await client.championMasteries(platform, puuid);
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
      if (err instanceof RiotApiError && (err.status === 401 || err.status === 403)) throw err;
      log(`mastery lookup failed for ${account.gameName}: ${(err as Error).message}`);
    }

    // Matches since the cursor.
    const lookback = Math.floor(Date.now() / 1000) - (options.lookbackDays ?? 120) * 86_400;
    const cursor = account.puuid ? await cursorFor(db, account.id) : null;
    const startTime = cursor ? Math.max(lookback, cursor - 3600) : lookback;
    const ids = await client.allMatchIdsByPuuid(platform, puuid, { startTime, count: Math.min(100, options.maxMatchesPerRun ?? 60) });
    const known = new Set((await db.select({ matchId: accountMatches.matchId }).from(accountMatches).where(and(eq(accountMatches.accountId, account.id), inArray(accountMatches.matchId, ids.length ? ids : ["-"])))).map((r) => r.matchId));
    const keyToId = new Map((await db.select({ key: champions.key, id: champions.id }).from(champions)).map((c) => [c.key, c.id]));
    for (const matchId of ids) {
      if (options.outOfTime?.()) break;
      if (known.has(matchId)) continue;
      let match: RiotMatch;
      try {
        match = await client.match(platform, matchId);
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
    await db.update(riotAccounts).set({ lastSyncAt: new Date(), syncStatus: "ok", syncError: null, resolveAttempts: 0, syncCursor: Math.floor(Date.now() / 1000), updatedAt: new Date() }).where(eq(riotAccounts.id, account.id));
    return result;
  } catch (err) {
    if (err instanceof RiotApiError && err.status === 400 && account.puuid) {
      // Riot could not decode the stored player id. Ids are encrypted per API key, so this is what
      // a key change looks like; forget the id and resolve it again from the Riot ID next time.
      const message = "The server's Riot API key changed, so this account is being re-verified from its Riot ID. Nothing to do; it happens automatically.";
      await db.update(riotAccounts).set({ puuid: null, puuidResolvedAt: null, platformSource: "user", lastSyncAt: new Date(), syncStatus: "pending", syncError: message, updatedAt: new Date() }).where(eq(riotAccounts.id, account.id));
      return { ...result, resolved: false, error: message, status: "pending" };
    }
    return fail(err, "sync");
  }
}

async function cursorFor(db: Db, accountId: string): Promise<number | null> {
  const [row] = await db.select({ cursor: riotAccounts.syncCursor }).from(riotAccounts).where(eq(riotAccounts.id, accountId));
  return row?.cursor ?? null;
}
