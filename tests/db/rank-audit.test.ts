import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { inArray, sql } from "drizzle-orm";
import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";
import { accountMatches, rankSnapshots, riotAccounts } from "@/server/db/schema";
import { createPlayer, getOrCreateTeam } from "@/server/repositories/team";
import { runJob } from "@/server/jobs";
import { FixtureStaticProvider } from "@/server/riot/static/fixture";
import { syncStaticData } from "@/server/riot/static/sync";

/*
  The rank audit reports the 2026 ranked year's rank history from stored rows only, with accounts
  as P1/A1, the LP changes the readings prove (and why the other games have none), and writes nothing.
  The rows the sync stores without a champion are stored here as the sync stores them
  (accounts/sync.ts, foldGame): a remake, or a game whose champion was still unknown three days
  after it, with the account, the match, the start time and the queue only; a listed game Riot
  refused for good with no start time (0).
*/

let handle: DbHandle;
const at = (iso: string) => new Date(iso);
const ms = (iso: string) => Date.parse(iso);

beforeAll(async () => {
  handle = await testDb();
  const db = handle.db;
  await syncStaticData(db, new FixtureStaticProvider(), { fingerprint: false });
  const team = await getOrCreateTeam(db);
  const p = await createPlayer(db, team.id, { displayName: "Secret Name", primaryRole: "MID", primaryPool: ["Ahri"] });
  const [a] = await db.insert(riotAccounts).values({ ownerType: "player", playerId: p.id, gameName: "SecretRiotId", tagLine: "OCE", platform: "oc1", puuid: "secret-puuid", label: "main" }).returning({ id: riotAccounts.id });
  const accountId = a!.id;
  const g = (matchId: string, created: string, minutes: number, win: boolean, queueId = 420, patch = "16.20") => ({ accountId, matchId, gameCreation: ms(created), gameDuration: Math.round(minutes * 60), queueId, win, patch, championId: "Ahri" });
  await db.insert(accountMatches).values([
    g("OC1_1", "2026-10-01T08:00:00Z", 25, true),
    g("OC1_2", "2026-10-01T09:00:00Z", 25, false),
    g("OC1_3", "2026-10-02T08:00:00Z", 25, true),
    g("OC1_4", "2026-10-02T09:00:00Z", 25, false),
    // A remake (not counted), as the sync stores it: no length, champion or result.
    { accountId, matchId: "OC1_R", gameCreation: ms("2026-10-03T09:00:00Z"), queueId: 420 },
    g("OC1_M", "2026-10-20T08:22:00Z", 25, true), // the game the readings enclose
    g("OC1_F", "2026-10-05T08:00:00Z", 30, true, 440), // Flex, never read: before tracking
    g("OC1_OLD", "2025-12-20T08:00:00Z", 30, true, 420, "15.24"), // the 2025 season: not part of the year
    // A listed game Riot refused for good, as the sync records it: no start time, no champion.
    { accountId, matchId: "OC1_GONE", gameCreation: 0, queueId: 420 },
  ]);
  await db.insert(rankSnapshots).values([
    { accountId, queue: "solo", tier: "GOLD", division: "II", leaguePoints: 46, wins: 2, losses: 2, capturedAt: at("2026-10-20T08:20:00Z") },
    { accountId, queue: "solo", tier: "GOLD", division: "II", leaguePoints: 70, wins: 3, losses: 2, capturedAt: at("2026-10-20T08:50:00Z") },
  ]);
}, 60_000);
afterAll(async () => {
  await handle.close();
});

describe("rank-audit", () => {
  it("counts the games the sync stores without a length (a remake, a champion still unknown) apart from the games, beside Riot's count", async () => {
    const db = handle.db;
    const [account] = await db.select({ id: riotAccounts.id }).from(riotAccounts);
    const solo = async () => {
      const summary = (await runJob(db, "rank-audit", "test")).summary as unknown as { accounts: Array<{ queues: Record<"solo", Record<string, unknown>> }> };
      return summary.accounts[0]!.queues.solo;
    };
    // A game whose champion was still unknown three days after it, as the sync then stores it:
    // like the remake, without a length, so it is not a game here and Riot's count may exceed the
    // stored games by it.
    await db.insert(accountMatches).values({ accountId: account!.id, matchId: "OC1_NEWCHAMP", gameCreation: ms("2026-10-06T08:00:00Z"), queueId: 420 });
    expect(await solo()).toMatchObject({ games: 5, remakesWithLength: 0, withoutLength: 2, withoutChampion: { refusedForGood: 1, championUnknownWithLength: 0 } });
    // Rows the sync never writes, a length under five minutes or a counted length without a
    // champion, have labels of their own (the second is counted as a game, as its length says).
    await db.insert(accountMatches).values([
      { accountId: account!.id, matchId: "OC1_SHORT", gameCreation: ms("2026-10-07T08:00:00Z"), gameDuration: 200, queueId: 420, win: false, patch: "16.20", championId: "Ahri" },
      { accountId: account!.id, matchId: "OC1_NOCHAMP", gameCreation: ms("2026-10-07T09:00:00Z"), gameDuration: 1500, queueId: 420, win: true, patch: "16.20", championId: null },
    ]);
    expect(await solo()).toMatchObject({ games: 6, remakesWithLength: 1, withoutLength: 2, withoutChampion: { refusedForGood: 1, championUnknownWithLength: 1 } });
    await db.delete(accountMatches).where(inArray(accountMatches.matchId, ["OC1_NEWCHAMP", "OC1_SHORT", "OC1_NOCHAMP"]));
  });

  it("reports the year's rank history per account and queue, proves the one enclosed game, and changes nothing", async () => {
    const db = handle.db;
    const count = async () => {
      const result = await db.execute(sql`SELECT (SELECT count(*) FROM rank_snapshots) + (SELECT count(*) FROM account_matches) AS n`);
      const rows = ((result as unknown as { rows?: Array<{ n: string }> }).rows ?? (result as unknown as Array<{ n: string }>));
      return Number(rows[0]!.n);
    };
    const before = await count();
    const result = await runJob(db, "rank-audit", "test");
    expect(result.ok).toBe(true);
    interface Queue {
      riotCountCheck: unknown;
      gamesBetweenReadings: Record<string, number>;
      lp: Record<string, number>;
      samples: unknown[];
    }
    const summary = result.summary as unknown as {
      year: { from: string };
      firstReading: string | null;
      accounts: Array<{ account: string; queues: Record<"solo" | "flex", Queue> }>;
      lpTotals: Record<string, number>;
      weeks: Array<{ week: string; solo: number; flex: number }>;
    };
    const text = JSON.stringify(summary);
    for (const secret of ["Secret Name", "SecretRiotId", "secret-puuid"]) expect(text).not.toContain(secret);

    expect(summary.year.from).toBe("2026-01-08");
    expect(summary.firstReading).toBe("2026-10-20T08:20:00.000Z");
    const acc = summary.accounts[0]!;
    expect(acc.account).toBe("P1/A1");
    const solo = acc.queues.solo;
    expect(solo).toMatchObject({ games: 5, remakesWithLength: 0, withoutLength: 1, readings: 2, firstRank: "Gold II 46 LP", lastRank: "Gold II 70 LP", withoutChampion: { refusedForGood: 1, championUnknownWithLength: 0 } });
    expect(acc.queues.flex).toMatchObject({ withoutLength: 0, withoutChampion: { refusedForGood: 0, championUnknownWithLength: 0 } });
    // Riot counted 4 games of the year by the first reading; the store holds exactly those 4 (the remake aside).
    expect(solo.riotCountCheck).toMatchObject({ riotCount: 4, certain: 4, possible: 4, agrees: true });
    expect(solo.gamesBetweenReadings["1 game"]).toBe(1);
    expect(solo.lp).toEqual({ "none:before-tracking": 4, lp: 1 });
    expect(solo.samples).toEqual([{ day: "2026-10-20", result: "W", change: "+24 LP", before: "Gold II 46 LP", after: "Gold II 70 LP", beforeReadMinutesBeforeCreation: 2, afterReadMinutesAfterEnd: 3 }]);
    expect(acc.queues.flex).toMatchObject({ games: 1, readings: 0, lp: { "none:before-tracking": 1 } });
    expect(summary.lpTotals).toEqual({ "none:before-tracking": 5, lp: 1 });
    // The year by week starts with the week of 8 January; October's games are in their weeks.
    expect(summary.weeks[0]!.week).toBe("2026-01-05");
    expect(summary.weeks.find((w) => w.week === "2026-09-28")).toMatchObject({ solo: 4, flex: 0 });
    expect(await count()).toBe(before);
  });
});
