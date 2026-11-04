import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
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
    g("OC1_R", "2026-10-03T09:00:00Z", 3.5, false), // a remake: not counted
    g("OC1_M", "2026-10-20T08:22:00Z", 25, true), // the game the readings enclose
    g("OC1_F", "2026-10-05T08:00:00Z", 30, true, 440), // Flex, never read: before tracking
    g("OC1_OLD", "2025-12-20T08:00:00Z", 30, true, 420, "15.24"), // the 2025 season: not part of the year
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
    const summary = result.summary as Record<string, any>;
    const text = JSON.stringify(summary);
    for (const secret of ["Secret Name", "SecretRiotId", "secret-puuid"]) expect(text).not.toContain(secret);

    expect(summary.year.from).toBe("2026-01-08");
    expect(summary.firstReading).toBe("2026-10-20T08:20:00.000Z");
    const [acc] = summary.accounts;
    expect(acc.account).toBe("P1/A1");
    const solo = acc.queues.solo;
    expect(solo).toMatchObject({ games: 5, remakes: 1, readings: 2, firstRank: "Gold II 46 LP", lastRank: "Gold II 70 LP" });
    // Riot counted 4 games of the year by the first reading; the store holds exactly those 4 (the remake aside).
    expect(solo.riotCountCheck).toMatchObject({ riotCount: 4, certain: 4, possible: 4, agrees: true });
    expect(solo.gamesBetweenReadings["1 game"]).toBe(1);
    expect(solo.lp).toEqual({ "none:before-tracking": 4, lp: 1 });
    expect(solo.samples).toEqual([{ day: "2026-10-20", result: "W", change: "+24 LP", before: "Gold II 46 LP", after: "Gold II 70 LP", beforeReadMinutesBeforeCreation: 2, afterReadMinutesAfterEnd: 3 }]);
    expect(acc.queues.flex).toMatchObject({ games: 1, readings: 0, lp: { "none:before-tracking": 1 } });
    expect(summary.lpTotals).toEqual({ "none:before-tracking": 5, lp: 1 });
    // The year by week starts with the week of 8 January; October's games are in their weeks.
    expect(summary.weeks[0].week).toBe("2026-01-05");
    expect(summary.weeks.find((w: { week: string }) => w.week === "2026-09-28")).toMatchObject({ solo: 4, flex: 0 });
    expect(await count()).toBe(before);
  });
});
