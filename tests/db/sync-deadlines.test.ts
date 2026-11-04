import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { and, eq, gte, like } from "drizzle-orm";
import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";
import { accountMatches, appSettings, riotAccounts } from "@/server/db/schema";
import { FixtureStaticProvider } from "@/server/riot/static/fixture";
import { syncStaticData } from "@/server/riot/static/sync";
import { createPlayer, getOrCreateTeam } from "@/server/repositories/team";
import { addAccount, listAccountsForPlayer } from "@/server/accounts/repository";
import { syncAccount } from "@/server/accounts/sync";
import { refreshPlayerMatches } from "@/server/accounts/refresh";
import { kickoffAccountSync, refreshPlayerAccountsIfDue } from "@/server/accounts/kickoff";
import { RiotApiClient } from "@/server/riot/api/client";
import { RateLimiter, RateLimiterPool } from "@/server/riot/api/rate-limiter";
import { runJob } from "@/server/jobs";
import fixture from "@/server/riot/fixtures/champions.fixture.json";

/*
  Riot request deadlines. Every caller with a time budget gives its Riot client a deadline, and a
  request that would have to wait past it (a full rate-limit window, a 429's Retry-After) fails at
  once instead of sleeping: production, 2026-10-14, an account sync waiting on Riot's two-minute
  window used 121 s of a 75 s budget, and a tick that runs past the 300 s function limit is killed
  with its job left "running". Such a stop is a run out of time, never a failed sync: the account
  is not marked pending, the key is not reported unavailable, and what was collected is kept.
*/

const keyOf = (id: string) => Number(fixture.champions.find((c) => c.id === id)!.key);
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** Riot for these tests: Riot IDs resolve, rank and mastery are empty, and `games` lists the Solo/Duo games of `puuid`. */
function fakeRiot(calls: string[], options: { puuid?: string; games?: string[] } = {}) {
  const puuid = options.puuid ?? "puuid-deadline";
  return async (input: string | URL | Request): Promise<Response> => {
    const url = String(input);
    calls.push(url);
    const byId = /\/accounts\/by-riot-id\/([^/]+)\/([^/?]+)/.exec(url);
    if (byId) return json({ puuid: `puuid-${decodeURIComponent(byId[1]!)}`, gameName: decodeURIComponent(byId[1]!), tagLine: decodeURIComponent(byId[2]!) });
    if (url.includes("/region/by-game/")) return json({ puuid, game: "lol", region: "oc1" });
    if (url.includes("/league/v4/") || url.includes("/champion-mastery/")) return json([]);
    if (url.includes("/ids?")) return json(new URL(url).searchParams.get("queue") === "420" ? (options.games ?? []) : []);
    const matchId = /\/matches\/(OC1_\d+)$/.exec(url)?.[1];
    if (matchId && options.games?.includes(matchId)) {
      const participants = Array.from({ length: 10 }, (_, i) => ({ puuid: i === 0 ? puuid : `other-${i}`, teamId: i < 5 ? 100 : 200, championId: i === 0 ? keyOf("Gwen") : keyOf("Ahri"), teamPosition: i % 5 === 0 ? "TOP" : "MIDDLE", win: i < 5, kills: 3, deaths: 2, assists: 5, doubleKills: 0, tripleKills: 0, quadraKills: 0, pentaKills: 0 }));
      return json({ metadata: { matchId }, info: { gameCreation: Date.now() - 3_600_000, gameDuration: 1_700, gameVersion: "16.20.1.1", queueId: 420, teams: [], participants } });
    }
    return json({}, 404);
  };
}

/** A fake clock for a client and its limiter; sleeping moves it on (a test never really waits). */
function clock() {
  let t = Date.now();
  return { now: () => t, sleep: async (ms: number) => void (t += ms) };
}

let handle: DbHandle;
let teamId: string;
beforeAll(async () => {
  handle = await testDb();
  await syncStaticData(handle.db, new FixtureStaticProvider(), { fingerprint: false });
  teamId = (await getOrCreateTeam(handle.db)).id;
}, 60_000);
afterAll(async () => {
  await handle.close();
});

const stored = async (accountId: string) => (await handle.db.select().from(riotAccounts).where(eq(riotAccounts.id, accountId)))[0]!;
/** The Riot credential record (Settings → Data health), if anything was recorded. */
const credential = async () => (await handle.db.select({ value: appSettings.value }).from(appSettings).where(eq(appSettings.key, "riot-credential")))[0]?.value as { lastOutcome?: string; lastError?: string | null } | undefined;

describe("account sync with a deadline", () => {
  it("stops before the first request when Riot's limits would keep it waiting past the deadline, and leaves the account as it was", async () => {
    const db = handle.db;
    const player = await createPlayer(db, teamId, { displayName: "Deadline First", primaryRole: "TOP", primaryPool: ["Gwen"] });
    const account = await addAccount(db, { ownerType: "player", playerId: player.id, riotId: "Deadline First#OCE", platform: "oc1" });
    const c = clock();
    const limiter = new RateLimiter([{ requests: 100, seconds: 120 }], c.now, c.sleep);
    // A 429 has just paused the key for 90 s; the run has 20 s left.
    limiter.pause(90);
    const calls: string[] = [];
    const client = new RiotApiClient({ apiKey: "k", fetchImpl: fakeRiot(calls), limiter, now: c.now, sleep: c.sleep, deadline: c.now() + 20_000 });
    const start = c.now();
    const r = await syncAccount(db, client, account, { maxMatchesPerRun: 20 });
    const row = await stored(account.id);
    expect(row.syncStatus).toBe("never");
    expect(row).toMatchObject({ syncError: null, resolveAttempts: 0, lastSyncAt: null, puuid: null });
    expect(r.outOfTime).toBe(true);
    expect(r.error).toBeUndefined();
    expect(calls).toHaveLength(0);
    expect(c.now()).toBe(start);
    // Nothing is said against the key either.
    expect((await credential())?.lastOutcome).not.toBe("error");
  });

  it("stops mid-history when the window fills: the games already fetched are kept and the next run carries on from there", async () => {
    const db = handle.db;
    const player = await createPlayer(db, teamId, { displayName: "Deadline Middle", primaryRole: "TOP", primaryPool: ["Gwen"] });
    const account = await addAccount(db, { ownerType: "player", playerId: player.id, riotId: "Deadline Middle#OCE", platform: "oc1", puuid: "puuid-middle" });
    await db.update(riotAccounts).set({ platformSource: "riot", riotIdCheckedAt: new Date(), syncStatus: "ok" }).where(eq(riotAccounts.id, account.id));
    const games = ["OC1_9100001", "OC1_9100002", "OC1_9100003"];
    const c = clock();
    // Five requests fit in the window: rank, mastery, the Solo/Duo list and two of its three games.
    const calls: string[] = [];
    const client = new RiotApiClient({ apiKey: "k", fetchImpl: fakeRiot(calls, { puuid: "puuid-middle", games }), limiter: new RateLimiter([{ requests: 5, seconds: 120 }], c.now, c.sleep), now: c.now, sleep: c.sleep, deadline: c.now() + 20_000 });
    const fresh = (await listAccountsForPlayer(db, player.id))[0]!;
    const r = await syncAccount(db, client, fresh, { maxMatchesPerRun: 20 });
    expect(r.matchesFolded).toBe(2);
    expect(r).toMatchObject({ outOfTime: true, status: "ok" });
    expect(r.error).toBeUndefined();
    expect(calls).toHaveLength(5);
    const row = await stored(account.id);
    expect(row).toMatchObject({ syncStatus: "ok", syncError: null });
    // The Solo/Duo page is not complete: its position stays where it was, so the next run reads it again.
    expect(row.historyBackfill?.queues["420"]).toMatchObject({ offset: 0, done: false });
    expect(row.historyBackfill?.completedAt).toBeNull();
    expect(await db.select({ id: accountMatches.matchId }).from(accountMatches).where(eq(accountMatches.accountId, account.id))).toHaveLength(2);

    // The next run (the window has turned over) fetches only the game still missing.
    const next = new RiotApiClient({ apiKey: "k", fetchImpl: fakeRiot(calls, { puuid: "puuid-middle", games }), limiter: new RateLimiter([{ requests: 100, seconds: 120 }], c.now, c.sleep), now: c.now, sleep: c.sleep, deadline: c.now() + 20_000 });
    const again = await syncAccount(db, next, (await listAccountsForPlayer(db, player.id))[0]!, { maxMatchesPerRun: 20 });
    expect(again).toMatchObject({ matchesFolded: 1, status: "ok" });
    expect(again.outOfTime).toBeFalsy();
    expect(await db.select({ id: accountMatches.matchId }).from(accountMatches).where(eq(accountMatches.accountId, account.id))).toHaveLength(3);
    expect((await stored(account.id)).historyBackfill?.queues["420"]).toMatchObject({ offset: 3, done: true });
  });

  it("a Refresh that runs out of time says Riot did not answer in time, not that there is nothing new, and marks nothing", async () => {
    const db = handle.db;
    const player = await createPlayer(db, teamId, { displayName: "Deadline Refresh", primaryRole: "TOP", primaryPool: ["Gwen"] });
    const account = await addAccount(db, { ownerType: "player", playerId: player.id, riotId: "Deadline Refresh#OCE", platform: "oc1", puuid: "puuid-refresh" });
    await db.update(riotAccounts).set({ platformSource: "riot", riotIdCheckedAt: new Date(), syncStatus: "ok" }).where(eq(riotAccounts.id, account.id));
    const c = clock();
    const limiter = new RateLimiter([{ requests: 100, seconds: 120 }], c.now, c.sleep);
    limiter.pause(90);
    const calls: string[] = [];
    const client = new RiotApiClient({ apiKey: "k", fetchImpl: fakeRiot(calls, { puuid: "puuid-refresh" }), limiter, now: c.now, sleep: c.sleep, maxRetries: 0, deadline: c.now() + 40_000 });
    const outcome = await refreshPlayerMatches(db, client, player.id);
    expect(outcome).toEqual({ status: "failed", message: "Riot did not answer in time. Please try again in a few minutes." });
    expect(calls).toHaveLength(0);
    expect(await stored(account.id)).toMatchObject({ syncStatus: "ok", syncError: null });
  });
});

/*
  The callers that create their own client (the account-sync job, the first sync after sign-up, a
  profile view's refresh) give it their deadline. Riot is stood in for by a stubbed fetch, and the
  process's shared limiter pool is replaced by one a 429 paused for two minutes: without a
  deadline, each of these would sleep for those two minutes.
*/
describe("callers give their Riot client their deadline", () => {
  const env = { ...process.env };
  const saved = globalThis.__uniiverseRiotLimiters;
  const calls: string[] = [];
  const pausedPool = () => {
    const pool = new RateLimiterPool([{ requests: 100, seconds: 120 }]);
    for (const host of ["oc1", "asia", "sea", "americas", "europe"]) pool.for(host).pause(120);
    return pool;
  };
  const setUp = () => {
    calls.length = 0;
    process.env.RIOT_API_KEY = "RGAPI-00000000-0000-0000-0000-00000000dead";
    process.env.UNIIVERSE_BACKGROUND_REFRESH = "true";
    delete process.env.RIOT_RATE_LIMITS;
    process.env.UNIIVERSE_JOB_LOGS = "silent";
    vi.stubGlobal("fetch", fakeRiot(calls));
    globalThis.__uniiverseRiotLimiters = pausedPool();
  };
  afterEach(() => {
    vi.unstubAllGlobals();
    globalThis.__uniiverseRiotLimiters = saved;
    for (const key of ["RIOT_API_KEY", "UNIIVERSE_BACKGROUND_REFRESH", "RIOT_RATE_LIMITS", "UNIIVERSE_JOB_LOGS"]) {
      if (env[key] === undefined) delete process.env[key];
      else process.env[key] = env[key];
    }
  });

  it("the account-sync job stops at its budget, untouched, and claims no account it does not start", async () => {
    setUp();
    const db = handle.db;
    const player = await createPlayer(db, teamId, { displayName: "Deadline Job", primaryRole: "TOP", primaryPool: ["Gwen"] });
    const first = await addAccount(db, { ownerType: "player", playerId: player.id, riotId: "Deadline Job#OCE", platform: "oc1" });
    const second = await addAccount(db, { ownerType: "player", playerId: player.id, riotId: "Deadline Job Alt#OCE", platform: "oc1" });
    // Leases are stamped with the server's clock (claimLease), so this picks out the job's claims.
    const since = new Date();
    const started = Date.now();
    const result = await runJob(db, "account-sync", "test", { budgetMs: 8_000 });
    expect(Date.now() - started).toBeLessThan(5_000);
    expect(result).toMatchObject({ ok: true, degraded: false });
    expect(calls).toHaveLength(0);
    for (const a of [first, second]) expect(await stored(a.id)).toMatchObject({ syncStatus: "never", syncError: null, resolveAttempts: 0 });
    // The first account it started found no time; the job stopped there instead of claiming the rest.
    const claimed = await db.select({ key: appSettings.key }).from(appSettings).where(and(like(appSettings.key, "account_sync:%"), gte(appSettings.updatedAt, since)));
    expect(claimed).toHaveLength(1);
  }, 10_000);

  it("the first sync after sign-up stops at its 20 seconds", async () => {
    setUp();
    const db = handle.db;
    const player = await createPlayer(db, teamId, { displayName: "Deadline Kickoff", primaryRole: "TOP", primaryPool: ["Gwen"] });
    const account = await addAccount(db, { ownerType: "player", playerId: player.id, riotId: "Deadline Kickoff#OCE", platform: "oc1" });
    const started = Date.now();
    await kickoffAccountSync(db, player.id);
    expect(Date.now() - started).toBeLessThan(5_000);
    expect(calls).toHaveLength(0);
    expect(await stored(account.id)).toMatchObject({ syncStatus: "never", syncError: null, resolveAttempts: 0 });
  }, 10_000);

  it("a profile view's refresh stops at its 40 seconds", async () => {
    setUp();
    const db = handle.db;
    const player = await createPlayer(db, teamId, { displayName: "Deadline View", primaryRole: "TOP", primaryPool: ["Gwen"] });
    const account = await addAccount(db, { ownerType: "player", playerId: player.id, riotId: "Deadline View#OCE", platform: "oc1" });
    const started = Date.now();
    await refreshPlayerAccountsIfDue(db, player.id);
    expect(Date.now() - started).toBeLessThan(5_000);
    expect(calls).toHaveLength(0);
    expect(await stored(account.id)).toMatchObject({ syncStatus: "never", syncError: null, resolveAttempts: 0 });
  }, 10_000);
});
