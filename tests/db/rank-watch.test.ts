import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";
import { accountMatches, rankSnapshots, riotAccounts } from "@/server/db/schema";
import { createPlayer, getOrCreateTeam } from "@/server/repositories/team";
import { FixtureStaticProvider } from "@/server/riot/static/fixture";
import { syncStaticData } from "@/server/riot/static/sync";
import { RiotApiClient } from "@/server/riot/api/client";
import { RateLimiter } from "@/server/riot/api/rate-limiter";
import { accountsDueRankWatch, watchRanks } from "@/server/jobs/rank-watch";

/*
  The rank watch reads the accounts that played ranked recently every run and the others about
  hourly, never the never-ranked; an unchanged reading confirms, a change is stored and becomes the
  account's shown rank; a full rate limit or a refused key stops the run.
*/

let handle: DbHandle;
const NOW = Date.UTC(2026, 10, 4, 8, 0);
const min = (m: number) => new Date(NOW - m * 60_000);
const ids: Record<string, string> = {};
const entry = (lp: number, wins: number) => ({ queueType: "RANKED_SOLO_5x5", tier: "GOLD", rank: "II", leaguePoints: lp, wins, losses: 10 });

function riot(answers: Record<string, unknown>) {
  const asked: string[] = [];
  const fetchImpl = async (input: string | URL | Request): Promise<Response> => {
    const puuid = decodeURIComponent(String(input).split("/entries/by-puuid/")[1] ?? "");
    asked.push(puuid);
    const a = answers[puuid];
    if (typeof a === "number" || a === undefined) return new Response("{}", { status: typeof a === "number" ? a : 404 });
    return new Response(JSON.stringify(a), { status: 200, headers: { "content-type": "application/json" } });
  };
  return { client: new RiotApiClient({ apiKey: "RGAPI-test", fetchImpl, limiter: new RateLimiter([{ requests: 1_000, seconds: 1 }]), maxRetries: 0, noWait: true, sleep: async () => {} }), asked };
}

beforeAll(async () => {
  handle = await testDb();
  const db = handle.db;
  await syncStaticData(db, new FixtureStaticProvider(), { fingerprint: false });
  const team = await getOrCreateTeam(db);
  const p = await createPlayer(db, team.id, { displayName: "Watched", primaryRole: "MID", primaryPool: ["Ahri"] });
  // name, last ranked game (days ago, or null), last reading (minutes ago, or null)
  const plan: Array<[string, number | null, number | null]> = [
    ["active-due", 2, 10],
    ["active-fresh", 2, 1],
    ["idle-fresh", 60, 30],
    ["idle-due", 60, 120],
    ["never-ranked", 2, null],
  ];
  for (const [name, gameDays, readMin] of plan) {
    const [a] = await db.insert(riotAccounts).values({ ownerType: "player", playerId: p.id, gameName: name, tagLine: "T", platform: "oc1", puuid: name, label: "alt" }).returning({ id: riotAccounts.id });
    ids[name] = a!.id;
    if (gameDays !== null) await db.insert(accountMatches).values({ accountId: a!.id, matchId: `OC1_${name}`, gameCreation: NOW - gameDays * 86_400_000, gameDuration: 1800, queueId: 420, win: true, patch: "16.21", championId: "Ahri" });
    // The reading's values were first seen just after the last game; the last confirmation is what makes it due or not.
    if (readMin !== null) await db.insert(rankSnapshots).values({ accountId: a!.id, queue: "solo", tier: "GOLD", division: "II", leaguePoints: 40, wins: 10, losses: 10, capturedAt: new Date(NOW - (gameDays ?? 90) * 86_400_000 + 3_600_000), confirmedAt: min(readMin) });
  }
}, 60_000);
afterAll(async () => {
  await handle.close();
});

describe("rank watch", () => {
  it("chooses the active accounts due a reading first, then the idle ones an hour on, never the never-ranked", async () => {
    const due = await accountsDueRankWatch(handle.db, NOW);
    expect(due.map((a) => a.puuid)).toEqual(["active-due", "idle-due"]);
    expect(due.map((a) => a.active)).toEqual([true, false]);
  });

  it("confirms an unchanged reading, stores a change and shows it as the account's rank", async () => {
    const db = handle.db;
    const { client, asked } = riot({ "active-due": [entry(40, 10)], "idle-due": [entry(62, 11)] });
    const run = await watchRanks(db, client, { deadline: Date.now() + 60_000, now: NOW });
    expect(asked).toEqual(["active-due", "idle-due"]);
    expect(run).toMatchObject({ due: 2, active: 1, read: 2, changed: 1, failed: 0, stoppedBy: null });
    const rowsOf = async (id: string) => (await db.select().from(rankSnapshots).where(eq(rankSnapshots.accountId, id))).sort((a, b) => a.capturedAt.getTime() - b.capturedAt.getTime());
    const active = await rowsOf(ids["active-due"]!);
    expect(active).toHaveLength(1);
    expect(active[0]!.confirmedAt!.getTime()).toBeGreaterThan(min(10).getTime());
    const idle = await rowsOf(ids["idle-due"]!);
    expect(idle.map((r) => r.leaguePoints)).toEqual([40, 62]);
    const [shown] = await db.select({ lp: riotAccounts.leaguePoints, wins: riotAccounts.rankedWins }).from(riotAccounts).where(eq(riotAccounts.id, ids["idle-due"]!));
    expect(shown).toEqual({ lp: 62, wins: 11 });
  });

  it("stops at a full rate limit or a refused key, and the next run reads again", async () => {
    const db = handle.db;
    const later = NOW + 10 * 60_000;
    const limited = riot({ "active-due": 429, "active-fresh": [entry(40, 10)] });
    expect(await watchRanks(db, limited.client, { deadline: Date.now() + 60_000, now: later })).toMatchObject({ read: 0, stoppedBy: "no room in the rate limits" });
    expect(limited.asked).toEqual(["active-due"]);
    const refused = riot({ "active-due": 403 });
    expect((await watchRanks(db, refused.client, { deadline: Date.now() + 60_000, now: later })).stoppedBy).toBe("Riot refused the key (403)");
  });
});
