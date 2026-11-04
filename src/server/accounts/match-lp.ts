import { and, desc, eq, gte, lt } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { accountMatches, rankSnapshots } from "@/server/db/schema";
import { attributeLp, type LpRecord, type QueueGame, type RankReadingRow } from "@/domain/lp-attribution";
import { RANKED_YEAR_START, rankedSeasonOfPatch } from "@/domain/ranked-year";
import type { RankQueue } from "@/domain/rank-progress";

/*
  The LP each ranked game on a page gained or lost, where the account's rank readings prove it
  (domain/lp-attribution), read from the store only: no Riot request. Only what decides the page's
  games is read: per account and queue, the readings from the last one at least a week before the
  page's oldest game, and the ranked games since. A week holds every reading and game that can
  enclose a page game; what lies before only moves the count's offset, which the rule allows for.
*/

const QUEUE_OF: Record<number, RankQueue> = { 420: "solo", 440: "flex" };
const QUEUE_ID: Record<RankQueue, number> = { solo: 420, flex: 440 };
const LOOKBACK_MS = 7 * 86_400_000;

export interface PageGame {
  matchId: string;
  accountId: string;
  queueId: number | null;
  /** Riot's gameCreation (ms). */
  gameCreation: number;
}

/** LP records for the page's ranked games of the 2026 ranked year (others are absent from the map). */
export async function lpForGames(db: Db, page: readonly PageGame[]): Promise<Map<string, LpRecord>> {
  const out = new Map<string, LpRecord>();
  const ranked = page.filter((g) => g.queueId !== null && QUEUE_OF[g.queueId] && g.gameCreation >= RANKED_YEAR_START);
  if (ranked.length === 0) return out;
  const groups = new Map<string, { accountId: string; queue: RankQueue; matchIds: string[]; oldest: number }>();
  for (const g of ranked) {
    const queue = QUEUE_OF[g.queueId!]!;
    const key = `${g.accountId}:${queue}`;
    const group = groups.get(key) ?? { accountId: g.accountId, queue, matchIds: [], oldest: g.gameCreation };
    group.matchIds.push(g.matchId);
    group.oldest = Math.min(group.oldest, g.gameCreation);
    groups.set(key, group);
  }
  await Promise.all(
    [...groups.values()].map(async (group) => {
      const since = new Date(group.oldest - LOOKBACK_MS);
      const mine = and(eq(rankSnapshots.accountId, group.accountId), eq(rankSnapshots.queue, group.queue));
      const columns = { tier: rankSnapshots.tier, division: rankSnapshots.division, leaguePoints: rankSnapshots.leaguePoints, wins: rankSnapshots.wins, losses: rankSnapshots.losses, capturedAt: rankSnapshots.capturedAt, confirmedAt: rankSnapshots.confirmedAt };
      const [anchor, recent] = await Promise.all([
        db.select(columns).from(rankSnapshots).where(and(mine, lt(rankSnapshots.capturedAt, since))).orderBy(desc(rankSnapshots.capturedAt)).limit(1),
        db.select(columns).from(rankSnapshots).where(and(mine, gte(rankSnapshots.capturedAt, since))),
      ]);
      const rows: RankReadingRow[] = [...anchor, ...recent].map((r) => ({ tier: r.tier, division: r.division, leaguePoints: r.leaguePoints, wins: r.wins, losses: r.losses, capturedAt: r.capturedAt.getTime(), confirmedAt: r.confirmedAt?.getTime() ?? null }));
      // The games from the first reading read (or the window, without one): a game before it can only shift the offset.
      const from = Math.max(RANKED_YEAR_START, Math.min(since.getTime(), ...rows.map((r) => r.capturedAt)) - 86_400_000);
      const games = await db
        .select({ matchId: accountMatches.matchId, gameCreation: accountMatches.gameCreation, gameDuration: accountMatches.gameDuration, win: accountMatches.win, patch: accountMatches.patch })
        .from(accountMatches)
        .where(and(eq(accountMatches.accountId, group.accountId), eq(accountMatches.queueId, QUEUE_ID[group.queue]), gte(accountMatches.gameCreation, from)));
      const list: QueueGame[] = games
        .filter((g) => (g.patch ? rankedSeasonOfPatch(g.patch) !== null : true))
        .map((g) => ({ matchId: g.matchId, createdAt: g.gameCreation, durationS: g.gameDuration, win: g.win }));
      // A page game before the first reading read is before tracking: with no reading a week or more
      // before the page's oldest game, the first one read is the account's first.
      const records = attributeLp(rows, list);
      for (const id of group.matchIds) {
        const record = records.get(id);
        if (record) out.set(id, record);
      }
    }),
  );
  return out;
}
