import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { defineJob } from "./registry";
import { accountMatches, jobRuns, rankSnapshots } from "@/server/db/schema";
import { listPlayers, getOrCreateTeam } from "@/server/repositories/team";
import { listAccountsForPlayers } from "@/server/accounts/repository";
import { attributeLp, isCountedGame, mergeReadings, storedCountAt, type LpRecord, type QueueGame, type RankReadingRow } from "@/domain/lp-attribution";
import { RANKED_SEASONS_2026, RANKED_YEAR_START, rankedSeasonOfPatch } from "@/domain/ranked-year";
import { rankLabel, type RankQueue } from "@/domain/rank-progress";
import { canonicalPatch } from "@/domain/patch";

/*
  Read-only audit of ranked history for the 2026 ranked year (from 8 January): for every linked
  account of the team's players and each ranked queue, Riot's own count of the year's games
  against the stored games, the rank readings and what lies between them, and how many games have
  an LP change recorded under domain/lp-attribution's rules (with a few recent examples to check
  by hand). Also when each 2026 season's first patch first appears in the stored games, how often
  accounts were synced and ranks read, and the year's games week by week. Accounts appear as
  P1/A1 (player 1, account 1) only: no names, Riot IDs or PUUIDs. Changes nothing.
*/

const QUEUE_ID: Record<RankQueue, number> = { solo: 420, flex: 440 };
const DAY = 86_400_000;
const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const iso = (ms: number | null | undefined) => (ms == null ? null : new Date(ms).toISOString());
/** Monday (UTC) of the week a moment falls in. */
const weekOf = (ms: number) => {
  const d = new Date(ms);
  const day = (d.getUTCDay() + 6) % 7;
  return isoDay(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day));
};
const median = (xs: number[]) => {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)]!;
};
const rowsOf = <T,>(result: unknown): T[] => ((result as { rows?: T[] }).rows ?? (result as T[])) as T[];

function lpTally(records: Iterable<LpRecord>) {
  const out: Record<string, number> = {};
  for (const r of records) {
    const key = r.kind === "none" ? `none:${r.reason}` : r.kind;
    out[key] = (out[key] ?? 0) + 1;
  }
  return out;
}

defineJob({
  key: "rank-audit",
  description: "Read-only: the 2026 ranked year's rank history per account and queue (Riot's game count against the stored games, the readings and the gaps between them, the games with a recorded LP change and why the others have none), the 2026 seasons' first patches, how often ranks were read, and the year's games by week. Accounts as P1/A1 only. Changes nothing.",
  defaultIntervalMinutes: null,
  allowConcurrent: true,
  run: async (ctx) => {
    const db = ctx.db;
    const now = Date.now();
    const team = await getOrCreateTeam(db);
    const players = await listPlayers(db, team.id, { includeArchived: true });
    const accounts = (await listAccountsForPlayers(db, players.map((p) => p.id))).filter((a) => a.ownerType === "player");
    const ids = accounts.map((a) => a.id);
    const playerNo = new Map(players.map((p, i) => [p.id, i + 1]));
    const accountNo = new Map<string, string>();
    for (const p of players) accounts.filter((a) => a.playerId === p.id).forEach((a, i) => accountNo.set(a.id, `P${playerNo.get(p.id)}/A${i + 1}`));

    const [snapshots, games] = ids.length
      ? await Promise.all([
          db.select().from(rankSnapshots).where(inArray(rankSnapshots.accountId, ids)),
          db
            .select({ accountId: accountMatches.accountId, matchId: accountMatches.matchId, gameCreation: accountMatches.gameCreation, gameDuration: accountMatches.gameDuration, queueId: accountMatches.queueId, win: accountMatches.win, patch: accountMatches.patch })
            .from(accountMatches)
            .where(and(inArray(accountMatches.accountId, ids), inArray(accountMatches.queueId, [420, 440]), gte(accountMatches.gameCreation, RANKED_YEAR_START - 7 * DAY))),
        ])
      : [[], []];
    // The 2026 ranked year's games: those on a 16.x patch (a game of December 2025 is not one).
    const yearGames = games.filter((g) => (g.patch ? rankedSeasonOfPatch(g.patch) !== null : g.gameCreation >= RANKED_YEAR_START));

    const perAccount = accounts.map((a) => {
      const queues = Object.fromEntries(
        (["solo", "flex"] as const).map((queue) => {
          const rows: RankReadingRow[] = snapshots
            .filter((s) => s.accountId === a.id && s.queue === queue)
            .map((s) => ({ tier: s.tier, division: s.division, leaguePoints: s.leaguePoints, wins: s.wins, losses: s.losses, capturedAt: s.capturedAt.getTime(), confirmedAt: null }));
          const list: Array<QueueGame & { patch: string | null }> = yearGames
            .filter((g) => g.accountId === a.id && g.queueId === QUEUE_ID[queue])
            .map((g) => ({ matchId: g.matchId, createdAt: g.gameCreation, durationS: g.gameDuration, win: g.win, patch: g.patch }))
            .sort((x, y) => x.createdAt - y.createdAt);
          const readings = mergeReadings(rows);
          const lp = attributeLp(rows, list);
          const first = readings[0] ?? null;
          const countedGames = list.filter(isCountedGame);
          // Riot's count of the year's games at the first reading, against the stored games ended by then.
          const check = first && first.wins !== null && first.losses !== null ? { riotCount: first.wins + first.losses, ...storedCountAt(first.capturedAt, list) } : null;
          const gaps: Record<string, number> = { "0 games": 0, "1 game": 0, "2 games": 0, "3-5 games": 0, "6+ games": 0, reset: 0 };
          const minutes: number[] = [];
          for (let i = 1; i < readings.length; i++) {
            const p = readings[i - 1]!;
            const r = readings[i]!;
            minutes.push(Math.round((r.capturedAt - p.capturedAt) / 60_000));
            if (p.wins === null || r.wins === null || p.losses === null || r.losses === null) continue;
            const d = r.wins + r.losses - (p.wins + p.losses);
            const key = d < 0 ? "reset" : d === 0 ? "0 games" : d === 1 ? "1 game" : d === 2 ? "2 games" : d <= 5 ? "3-5 games" : "6+ games";
            gaps[key]! += 1;
          }
          const bySeason: Record<string, number> = {};
          for (const g of countedGames) {
            const s = rankedSeasonOfPatch(g.patch)?.label ?? "unknown patch";
            bySeason[s] = (bySeason[s] ?? 0) + 1;
          }
          const samples = countedGames
            .map((g) => ({ g, r: lp.get(g.matchId)! }))
            .filter(({ r }) => r.kind !== "none")
            .slice(-5)
            .map(({ g, r }) => {
              if (r.kind === "none") return null;
              const end = g.createdAt + (g.durationS ?? 0) * 1000;
              return {
                day: isoDay(g.createdAt),
                result: g.win ? "W" : "L",
                change: r.kind === "lp" ? `${r.delta > 0 ? "+" : ""}${r.delta} LP` : r.kind,
                before: `${r.before.label} ${r.before.leaguePoints} LP`,
                after: `${r.after.label} ${r.after.leaguePoints} LP`,
                beforeReadMinutesBeforeCreation: Math.round((g.createdAt - r.before.at) / 60_000),
                afterReadMinutesAfterEnd: Math.round((r.after.at - end) / 60_000),
              };
            });
          const last = readings.at(-1) ?? null;
          return [
            queue,
            {
              games: countedGames.length,
              remakes: list.length - countedGames.length,
              firstGame: iso(countedGames[0]?.createdAt),
              lastGame: iso(countedGames.at(-1)?.createdAt),
              bySeason,
              readings: rows.length,
              distinctReadings: readings.length,
              firstReading: iso(first?.capturedAt),
              firstRank: first ? (first.tier ? `${rankLabel(first.tier, first.division)} ${first.leaguePoints} LP` : "Unranked") : null,
              lastReading: iso(last?.capturedAt),
              lastRank: last ? (last.tier ? `${rankLabel(last.tier, last.division)} ${last.leaguePoints} LP` : "Unranked") : null,
              riotCountCheck: check ? { ...check, agrees: check.riotCount >= check.certain && check.riotCount <= check.possible } : null,
              gamesBetweenReadings: gaps,
              medianMinutesBetweenReadings: median(minutes),
              lp: lpTally(countedGames.map((g) => lp.get(g.matchId)!)),
              samples: samples.filter(Boolean),
            },
          ];
        }),
      );
      return { account: accountNo.get(a.id) ?? "?", label: a.label, platform: a.platform, seasonHistoryComplete: a.historyBackfill?.season === 16 ? !!a.historyBackfill.completedAt : false, queues };
    });

    // When each 2026 season's first patch first appears among the stored games (all queues).
    // Games store the client's version as written ("26.9" or "16.9" for the same patch): both are asked.
    const patchNames = RANKED_SEASONS_2026.flatMap((s) => [s.firstPatch, s.firstPatch.replace(/^16\./, "26.")]);
    const firstOnPatch = rowsOf<{ patch: string; first: number | string }>(
      await db.execute(sql`SELECT patch, min(game_creation) AS first FROM account_matches WHERE patch IN (${sql.join(patchNames.map((p) => sql`${p}`), sql`, `)}) GROUP BY patch`),
    );
    const seasons = RANKED_SEASONS_2026.map((s) => {
      const firsts = firstOnPatch.filter((r) => canonicalPatch(r.patch) === s.firstPatch).map((r) => Number(r.first));
      return { season: s.label, from: isoDay(s.from), firstPatch: s.firstPatch, firstStoredGameOnPatch: firsts.length ? iso(Math.min(...firsts)) : null };
    });

    // The team's 2026 ranked games and readings by week, from the week of 8 January.
    const weeks = new Map<string, { solo: number; flex: number; soloReadings: number; flexReadings: number }>();
    for (let w = Date.parse(`${weekOf(RANKED_YEAR_START)}T00:00:00Z`); w <= now; w += 7 * DAY) weeks.set(isoDay(w), { solo: 0, flex: 0, soloReadings: 0, flexReadings: 0 });
    for (const g of yearGames) {
      if (!isCountedGame({ matchId: g.matchId, createdAt: g.gameCreation, durationS: g.gameDuration, win: g.win })) continue;
      const row = weeks.get(weekOf(g.gameCreation));
      if (row) row[g.queueId === 420 ? "solo" : "flex"] += 1;
    }
    for (const s of snapshots) {
      const row = weeks.get(weekOf(s.capturedAt.getTime()));
      if (row) row[s.queue === "solo" ? "soloReadings" : "flexReadings"] += 1;
    }

    // How often accounts were synced (each sync reads the rank) and ranks recorded, the last 21 days.
    const since = new Date(now - 21 * DAY);
    const syncRuns = await db.select({ startedAt: jobRuns.startedAt, trigger: jobRuns.trigger }).from(jobRuns).where(and(eq(jobRuns.job, "account-sync"), gte(jobRuns.startedAt, since)));
    const cadence = new Map<string, { syncRuns: number; byTrigger: Record<string, number>; readings: number }>();
    for (let d = Date.parse(`${isoDay(since.getTime())}T00:00:00Z`); d <= now; d += DAY) cadence.set(isoDay(d), { syncRuns: 0, byTrigger: {}, readings: 0 });
    for (const r of syncRuns) {
      const row = cadence.get(isoDay(r.startedAt.getTime()));
      if (!row) continue;
      row.syncRuns += 1;
      row.byTrigger[r.trigger] = (row.byTrigger[r.trigger] ?? 0) + 1;
    }
    for (const s of snapshots) {
      const row = cadence.get(isoDay(s.capturedAt.getTime()));
      if (row) row.readings += 1;
    }

    const allLp = perAccount.flatMap((a) => Object.values(a.queues).map((q) => q.lp));
    const totals: Record<string, number> = {};
    for (const t of allLp) for (const [k, v] of Object.entries(t)) totals[k] = (totals[k] ?? 0) + v;
    const firstReading = snapshots.reduce<number | null>((m, s) => (m === null || s.capturedAt.getTime() < m ? s.capturedAt.getTime() : m), null);
    ctx.log(`rank-audit: ${accounts.length} accounts, ${yearGames.length} ranked games of 2026 stored, ${snapshots.length} rank readings since ${iso(firstReading) ?? "never"}; LP recorded for ${totals.lp ?? 0} games`);
    return {
      ok: true,
      summary: {
        year: { from: isoDay(RANKED_YEAR_START), seasons },
        firstReading: iso(firstReading),
        accounts: perAccount,
        lpTotals: totals,
        weeks: [...weeks].map(([week, v]) => ({ week, ...v })),
        cadence: [...cadence].map(([day, v]) => ({ day, ...v })),
      },
    };
  },
});
