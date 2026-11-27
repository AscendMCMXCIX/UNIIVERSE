import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";
import { accountMatches, rankSnapshots, riotAccounts } from "@/server/db/schema";
import { createPlayer, getOrCreateTeam } from "@/server/repositories/team";
import { runJob } from "@/server/jobs";
import { FixtureStaticProvider } from "@/server/riot/static/fixture";
import { syncStaticData } from "@/server/riot/static/sync";

/*
  The rank audit across the 2027 ranked year's reset, on a fixed clock (12 Jan 2027): one account
  reset to Iron IV (its own reset reading opens 2027), one not read since December (still on 2026),
  17.1 games counted in 2027's Season 1, and how far the reset has reached, in counts only, with the
  year's first day still an estimate.
*/

let handle: DbHandle;
const at = (iso: string) => new Date(iso);
const ms = (iso: string) => Date.parse(iso);

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ["Date"], shouldAdvanceTime: true });
  vi.setSystemTime(Date.UTC(2027, 0, 12, 12));
  handle = await testDb();
  const db = handle.db;
  await syncStaticData(db, new FixtureStaticProvider(), { fingerprint: false });
  const team = await getOrCreateTeam(db);
  const account = async (name: string) => {
    const p = await createPlayer(db, team.id, { displayName: name, primaryRole: "MID", primaryPool: ["Ahri"] });
    const [a] = await db.insert(riotAccounts).values({ ownerType: "player", playerId: p.id, gameName: `${name}Id`, tagLine: "OCE", platform: "oc1", puuid: `${name}-puuid`, label: "main" }).returning({ id: riotAccounts.id });
    return a!.id;
  };
  const reset = await account("Resetter");
  const waiting = await account("Waiter");
  const g = (accountId: string, matchId: string, created: string, patch: string) => ({ accountId, matchId, gameCreation: ms(created), gameDuration: 1500, queueId: 420, win: true, patch, championId: "Ahri" });
  await db.insert(accountMatches).values([g(reset, "OC1_D", "2026-12-20T08:00:00Z", "16.24"), g(reset, "OC1_J1", "2027-01-09T08:00:00Z", "17.1"), g(reset, "OC1_J2", "2027-01-10T08:00:00Z", "27.1"), g(waiting, "OC1_W", "2026-12-21T08:00:00Z", "16.24")]);
  await db.insert(rankSnapshots).values([
    { accountId: reset, queue: "solo", tier: "GOLD", division: "II", leaguePoints: 46, wins: 150, losses: 140, capturedAt: at("2026-12-20T09:00:00Z"), confirmedAt: at("2027-01-07T06:00:00Z") },
    { accountId: reset, queue: "solo", tier: "IRON", division: "IV", leaguePoints: 0, wins: 0, losses: 0, capturedAt: at("2027-01-07T07:00:00Z") },
    { accountId: reset, queue: "solo", tier: "IRON", division: "II", leaguePoints: 10, wins: 2, losses: 0, capturedAt: at("2027-01-10T09:00:00Z") },
    { accountId: waiting, queue: "solo", tier: "SILVER", division: "I", leaguePoints: 20, wins: 40, losses: 41, capturedAt: at("2026-12-21T09:00:00Z"), confirmedAt: at("2026-12-28T09:00:00Z") },
  ]);
}, 60_000);
afterAll(async () => {
  await handle.close();
  vi.useRealTimers();
});

describe("rank-audit across the 2027 reset", () => {
  it("reports each account's ladder, 2027's games by season, and the reset's reach in counts, the year's first day an estimate", async () => {
    const result = await runJob(handle.db, "rank-audit", "test");
    expect(result.ok).toBe(true);
    const summary = result.summary as unknown as {
      year: { seasons: Array<{ season: string; firstPatch: string; firstStoredGameOnPatch: string | null }> };
      yearStarts: Array<{ year: number; fromConfirmed: boolean; resetReadings: number; openedByDate: number; stillOnEarlierYear: number }>;
      accounts: Array<{ account: string; queues: { solo: { bySeason: Record<string, number>; ladder: { year: number; opened: string; since: string | null; riotCountCheck: { riotCount: number; agrees: boolean } | null } } } }>;
    };
    const text = JSON.stringify(summary);
    for (const secret of ["Resetter", "Waiter", "puuid"]) expect(text).not.toContain(secret);
    expect(summary.year.seasons.map((s) => s.season)).toEqual(["2026 Season 1", "2026 Season 2", "2026 Season 3", "2027 Season 1"]);
    // The first 17.1 game (stored as "17.1" or Riot's public "27.1"): a check of Riot's date.
    expect(summary.year.seasons.at(-1)).toMatchObject({ firstPatch: "17.1", firstStoredGameOnPatch: "2027-01-09T08:00:00.000Z" });
    expect(summary.yearStarts).toEqual([{ year: 2027, from: "2027-01-07", fromConfirmed: false, resetReadings: 1, openedByDate: 0, stillOnEarlierYear: 1 }]);
    const [p1, p2] = summary.accounts;
    expect(p1!.queues.solo.ladder).toMatchObject({ year: 2027, opened: "reset", since: "2027-01-07" });
    expect(p1!.queues.solo.ladder.riotCountCheck).toMatchObject({ riotCount: 0, agrees: true });
    expect(p1!.queues.solo.bySeason).toEqual({ "2026 Season 3": 1, "2027 Season 1": 2 });
    expect(p2!.queues.solo.ladder).toMatchObject({ year: 2026, opened: "first", riotCountCheck: null });
  });
});
