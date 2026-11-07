import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";
import { accountMatches, riotAccounts } from "@/server/db/schema";
import { createPlayer, getOrCreateTeam } from "@/server/repositories/team";
import { runJob } from "@/server/jobs";
import { FixtureStaticProvider } from "@/server/riot/static/fixture";
import { syncStaticData } from "@/server/riot/static/sync";
import { recordRankSnapshots } from "@/server/accounts/rank-history";
import { lpForGames } from "@/server/accounts/match-lp";

/*
  The rank audit reads the confirmations the match cards read. An unchanged reading adds no row:
  it moves the last row's confirmed_at on (accounts/rank-history.ts), and domain/lp-attribution
  takes a reading as seen until then. Here the reading before the game is first stored six hours
  earlier and confirmed by the rank watch during the game, so the card proves the game's +24 LP;
  the audit must prove it too, not report it as unproven for want of a reading near its start.
*/

let handle: DbHandle;
let accountId: string;
const ms = (iso: string) => Date.parse(iso);
const solo = (lp: number, wins: number, losses: number) => [{ queueType: "RANKED_SOLO_5x5", tier: "GOLD", rank: "II", leaguePoints: lp, wins, losses }];

beforeAll(async () => {
  handle = await testDb();
  const db = handle.db;
  await syncStaticData(db, new FixtureStaticProvider(), { fingerprint: false });
  const team = await getOrCreateTeam(db);
  const p = await createPlayer(db, team.id, { displayName: "Secret Name", primaryRole: "MID", primaryPool: ["Ahri"] });
  const [a] = await db.insert(riotAccounts).values({ ownerType: "player", playerId: p.id, gameName: "SecretRiotId", tagLine: "OCE", platform: "oc1", puuid: "secret-puuid", label: "main" }).returning({ id: riotAccounts.id });
  accountId = a!.id;
  const g = (matchId: string, created: string, minutes: number, win: boolean) => ({ accountId, matchId, gameCreation: ms(created), gameDuration: Math.round(minutes * 60), queueId: 420, win, patch: "16.20", championId: "Ahri" });
  await db.insert(accountMatches).values([
    g("OC1_1", "2026-10-01T08:00:00Z", 25, true),
    g("OC1_2", "2026-10-01T09:00:00Z", 25, false),
    g("OC1_3", "2026-10-02T08:00:00Z", 25, true),
    g("OC1_4", "2026-10-02T09:00:00Z", 25, false),
    g("OC1_M", "2026-10-20T08:22:00Z", 25, true), // ends at 08:47
  ]);
  // Stored at 02:00; confirmed unchanged at 08:00 and at 08:30, during the game; the game's +24 read at 08:50.
  for (const [iso, entries] of [
    ["2026-10-20T02:00:00Z", solo(46, 2, 2)],
    ["2026-10-20T08:00:00Z", solo(46, 2, 2)],
    ["2026-10-20T08:30:00Z", solo(46, 2, 2)],
    ["2026-10-20T08:50:00Z", solo(70, 3, 2)],
  ] as const) await recordRankSnapshots(db, accountId, entries, new Date(iso));
}, 60_000);
afterAll(async () => {
  await handle.close();
});

describe("rank-audit with confirmed readings", () => {
  it("proves a game whose earlier reading was confirmed during it, as the match card does", async () => {
    const db = handle.db;
    const card = (await lpForGames(db, [{ matchId: "OC1_M", accountId, queueId: 420, gameCreation: ms("2026-10-20T08:22:00Z") }])).get("OC1_M");
    expect(card).toMatchObject({ kind: "lp", delta: 24, before: { at: ms("2026-10-20T08:30:00Z") } });

    const result = await runJob(db, "rank-audit", "test");
    expect(result.ok).toBe(true);
    const summary = result.summary as unknown as { accounts: Array<{ queues: { solo: { readings: number; lp: Record<string, number>; samples: unknown[] } } }>; lpTotals: Record<string, number> };
    const queue = summary.accounts[0]!.queues.solo;
    expect(queue.readings).toBe(2); // two changes: the confirmations add no row
    expect(queue.lp).toEqual({ "none:before-tracking": 4, lp: 1 });
    expect(summary.lpTotals).toEqual({ "none:before-tracking": 4, lp: 1 });
    expect(queue.samples).toEqual([{ day: "2026-10-20", result: "W", change: "+24 LP", before: "Gold II 46 LP", after: "Gold II 70 LP", beforeReadMinutesBeforeCreation: -8, afterReadMinutesAfterEnd: 3 }]);
  });
});
