import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { and, eq, gte, like } from "drizzle-orm";
import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";
import { accountMatches, appSettings, riotAccounts } from "@/server/db/schema";
import { FixtureStaticProvider } from "@/server/riot/static/fixture";
import { syncStaticData } from "@/server/riot/static/sync";
import { createPlayer, getOrCreateTeam } from "@/server/repositories/team";
import { addAccount, listAccountsForPlayer } from "@/server/accounts/repository";
import { SYNC_QUEUE_IDS, syncAccount } from "@/server/accounts/sync";
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

  it("an outage with no time left to retry is a failed sync, not a run out of time", async () => {
    // Review of the deadlines change: a back-off that would end past the deadline used to throw
    // the deadline's error, so a Riot outage near the end of a budget read as "out of time" and
    // the account was left as if nothing had happened. It is Riot failing: the account waits as
    // pending with Riot's reason, and the run is a failure the job counts (degraded).
    const db = handle.db;
    const player = await createPlayer(db, teamId, { displayName: "Deadline Outage", primaryRole: "TOP", primaryPool: ["Gwen"] });
    const account = await addAccount(db, { ownerType: "player", playerId: player.id, riotId: "Deadline Outage#OCE", platform: "oc1", puuid: "puuid-outage-deadline" });
    await db.update(riotAccounts).set({ platformSource: "riot", riotIdCheckedAt: new Date(), syncStatus: "ok" }).where(eq(riotAccounts.id, account.id));
    const c = clock();
    const calls: string[] = [];
    const down = async (input: string | URL | Request) => {
      calls.push(String(input));
      return json({ status: { message: "Service unavailable", status_code: 503 } }, 503);
    };
    // One back-off (1 s) fits; the next (2 s) would end past the deadline.
    const client = new RiotApiClient({ apiKey: "k", fetchImpl: down, limiter: new RateLimiter([{ requests: 100, seconds: 120 }], c.now, c.sleep), now: c.now, sleep: c.sleep, maxRetries: 4, deadline: c.now() + 1_500 });
    const r = await syncAccount(db, client, (await listAccountsForPlayer(db, player.id))[0]!, { maxMatchesPerRun: 20 });
    expect(r.outOfTime).toBeFalsy();
    expect(r.error).toBeTruthy();
    expect(r.status).toBe("pending");
    expect(calls.length).toBeGreaterThan(0);
    const row = await stored(account.id);
    expect(row.syncStatus).toBe("pending");
    expect(row.syncError).toMatch(/Riot's servers/);
  });

  /*
    Review of that fix: with the run's outOfTime() tied to the same clock (as every job and
    background sync passes it), a failure the best-effort lookups (rank, mastery, the Riot ID
    check, the active server) passed over was followed by a history step with no time left, and
    the account was written as synced, Riot's key as healthy. Riot failing is the run's outcome.
  */
  const outageAccount = async (name: string) => {
    const db = handle.db;
    const player = await createPlayer(db, teamId, { displayName: name, primaryRole: "TOP", primaryPool: ["Gwen"] });
    const account = await addAccount(db, { ownerType: "player", playerId: player.id, riotId: `${name}#OCE`, platform: "oc1", puuid: `puuid-${name.replace(/ /g, "-").toLowerCase()}` });
    // Waiting after an earlier failure: Pending with Riot's reason, an old cursor.
    await db.update(riotAccounts).set({ platformSource: "riot", riotIdCheckedAt: new Date(), syncStatus: "pending", syncError: "Riot's servers are having trouble. Your account is saved and retried automatically.", syncCursor: 1 }).where(eq(riotAccounts.id, account.id));
    return { player, account: (await listAccountsForPlayer(db, player.id))[0]! };
  };

  it("Riot failing fast at the end of the budget: the account stays Pending and the key's failure is recorded", async () => {
    const db = handle.db;
    const { account } = await outageAccount("Outage Fast");
    const c = clock();
    const calls: string[] = [];
    const down = async (input: string | URL | Request) => {
      calls.push(String(input));
      await c.sleep(800);
      return json({ status: { message: "Service unavailable", status_code: 503 } }, 503);
    };
    const deadline = c.now() + 1_500;
    const client = new RiotApiClient({ apiKey: "k", fetchImpl: down, limiter: new RateLimiter([{ requests: 100, seconds: 120 }], c.now, c.sleep), now: c.now, sleep: c.sleep, maxRetries: 4, deadline });
    const r = await syncAccount(db, client, account, { maxMatchesPerRun: 20, outOfTime: () => c.now() > deadline });
    // A failure (error, Pending), and the run is out of time, so its caller stops here too.
    expect(r).toMatchObject({ status: "pending", outOfTime: true });
    expect(r.error).toMatch(/Riot's servers/);
    const row = await stored(account.id);
    expect(row).toMatchObject({ syncStatus: "pending", syncCursor: 1 });
    expect(row.syncError).toMatch(/Riot's servers/);
    expect((await credential())?.lastOutcome).toBe("error");
  });

  it("Riot hanging: the account stays Pending, and nothing is asked after the deadline", async () => {
    const db = handle.db;
    const { account } = await outageAccount("Outage Hang");
    const c = clock();
    const sent: number[] = [];
    // Every request takes the client's whole timeout and is abandoned.
    const hang = async () => {
      sent.push(c.now());
      await c.sleep(15_000);
      throw new Error("This operation was aborted");
    };
    const start = c.now();
    const deadline = start + 75_000;
    const client = new RiotApiClient({ apiKey: "k", fetchImpl: hang, limiter: new RateLimiter([{ requests: 100, seconds: 120 }], c.now, c.sleep), now: c.now, sleep: c.sleep, maxRetries: 4, deadline });
    const r = await syncAccount(db, client, account, { maxMatchesPerRun: 20, outOfTime: () => c.now() > deadline });
    expect(r).toMatchObject({ status: "pending", outOfTime: true });
    expect(r.error).toMatch(/did not answer/);
    expect((await stored(account.id)).syncStatus).toBe("pending");
    expect((await credential())?.lastOutcome).toBe("error");
    // The lease's bound: no request starts after the deadline, so the sync ends by the deadline
    // plus one request's timeout (it held the account at most that long).
    expect(Math.max(...sent)).toBeLessThan(deadline);
    expect(c.now()).toBeLessThanOrEqual(deadline + 15_000);
  });

  it("Riot slow but answering: time running out before the history is a stop for time, and the account is not marked synced", async () => {
    const db = handle.db;
    const player = await createPlayer(db, teamId, { displayName: "Deadline Slow", primaryRole: "TOP", primaryPool: ["Gwen"] });
    const added = await addAccount(db, { ownerType: "player", playerId: player.id, riotId: "Deadline Slow#OCE", platform: "oc1", puuid: "puuid-slow" });
    const lastSyncAt = new Date(Date.now() - 6 * 3600_000);
    await db.update(riotAccounts).set({ platformSource: "riot", riotIdCheckedAt: new Date(), syncStatus: "ok", syncCursor: 7, lastSyncAt }).where(eq(riotAccounts.id, added.id));
    const account = (await listAccountsForPlayer(db, player.id))[0]!;
    const c = clock();
    const calls: string[] = [];
    const riot = fakeRiot(calls, { puuid: "puuid-slow" });
    const slow = async (input: string | URL | Request) => {
      await c.sleep(2_000);
      return riot(input);
    };
    const deadline = c.now() + 1_500;
    const client = new RiotApiClient({ apiKey: "k", fetchImpl: slow, limiter: new RateLimiter([{ requests: 100, seconds: 120 }], c.now, c.sleep), now: c.now, sleep: c.sleep, maxRetries: 4, deadline });
    const r = await syncAccount(db, client, account, { maxMatchesPerRun: 20, outOfTime: () => c.now() > deadline });
    expect(r.outOfTime).toBe(true);
    expect(r.error).toBeUndefined();
    // The rank request was answered and kept; nothing after the deadline was sent.
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain("/league/v4/");
    const row = await stored(account.id);
    expect(row).toMatchObject({ syncStatus: "ok", syncError: null, syncCursor: 7 });
    expect(row.lastSyncAt?.getTime()).toBe(lastSyncAt.getTime());
  });

  /*
    Review of that fix (round 2): the outcome is Riot's last answer to the lookups. Any of the four
    can be it; a later lookup Riot answers clears an earlier failure; a 429 is never a failure of
    Riot; and a run with no failure that could not read a season list that was due is a stop for
    time, which leaves the account as it was.
  */
  const lookups = { "the Riot ID check": "/accounts/by-puuid/", "the active-server lookup": "/region/by-game/", "the rank lookup": "/league/v4/", "the mastery lookup": "/champion-mastery/" } as const;
  const resetCredential = () => handle.db.delete(appSettings).where(eq(appSettings.key, "riot-credential"));
  /** Riot as fakeRiot, plus the Riot ID by PUUID; `answer` may replace any request's answer. */
  const riotWith = (calls: string[], puuid: string, answer: (url: string) => Promise<Response | null> | Response | null) => {
    const riot = fakeRiot(calls, { puuid });
    return async (input: string | URL | Request) => {
      const url = String(input);
      const replaced = await answer(url);
      if (replaced) {
        calls.push(url);
        return replaced;
      }
      if (url.includes("/accounts/by-puuid/")) {
        calls.push(url);
        return json({ puuid, gameName: "Same", tagLine: "OCE" });
      }
      return riot(input);
    };
  };

  for (const [lookup, path] of Object.entries(lookups)) {
    it(`Riot failing on ${lookup} as time runs out: the account stays Pending, the key's failure is recorded, the job stops`, async () => {
      const db = handle.db;
      const { account: base } = await outageAccount(`Last ${lookup.split(" ")[1]}`);
      // Every lookup runs: the Riot ID check is due and the server is the player's choice.
      await db.update(riotAccounts).set({ riotIdCheckedAt: null, platformSource: "user" }).where(eq(riotAccounts.id, base.id));
      const account = { ...base, riotIdCheckedAt: null, platformSource: "user" as const };
      await resetCredential();
      const c = clock();
      const deadline = c.now() + 10_000;
      const calls: string[] = [];
      const fetchImpl = riotWith(calls, account.puuid!, async (url) => {
        if (!url.includes(path)) return null;
        await c.sleep(11_000);
        return json({ status: { message: "Service unavailable", status_code: 503 } }, 503);
      });
      const client = new RiotApiClient({ apiKey: "k", fetchImpl, limiter: new RateLimiter([{ requests: 100, seconds: 120 }], c.now, c.sleep), now: c.now, sleep: c.sleep, maxRetries: 4, deadline });
      const r = await syncAccount(db, client, account, { maxMatchesPerRun: 20, outOfTime: () => c.now() > deadline });
      expect(r).toMatchObject({ status: "pending", outOfTime: true });
      expect(r.error).toMatch(/Riot's servers/);
      expect(calls.some((u) => u.includes("/ids?"))).toBe(false);
      expect(await stored(account.id)).toMatchObject({ syncStatus: "pending", syncCursor: 1 });
      expect((await credential())?.lastOutcome).toBe("error");
    });
  }

  // Each lookup that can clear an earlier failure: the failing one, then the one that answers as
  // time runs out (the Riot ID check is first, so there is nothing before it to clear).
  const clearing = [
    ["the Riot ID check", "the active-server lookup"],
    ["the active-server lookup", "the rank lookup"],
    ["the rank lookup", "the mastery lookup"],
  ] as const;
  for (const [failing, answering] of clearing) {
    it(`${answering} succeeding after ${failing} failed clears it: running out of time then is a stop for time`, async () => {
      const db = handle.db;
      const name = `Recovered ${answering.split(" ")[1]}`;
      const puuid = `puuid-${name.replace(/ /g, "-").toLowerCase()}`;
      const player = await createPlayer(db, teamId, { displayName: name, primaryRole: "TOP", primaryPool: ["Gwen"] });
      const added = await addAccount(db, { ownerType: "player", playerId: player.id, riotId: `${name}#OCE`, platform: "oc1", puuid });
      // Every lookup runs: the Riot ID check is due and the server is the player's choice.
      await db.update(riotAccounts).set({ platformSource: "user", riotIdCheckedAt: null, syncStatus: "ok", syncCursor: 7 }).where(eq(riotAccounts.id, added.id));
      const account = (await listAccountsForPlayer(db, player.id))[0]!;
      await resetCredential();
      const c = clock();
      const deadline = c.now() + 10_000;
      const calls: string[] = [];
      const fetchImpl = riotWith(calls, puuid, async (url) => {
        if (url.includes(lookups[failing])) return json({ status: { message: "Service unavailable", status_code: 503 } }, 503);
        if (url.includes(lookups[answering])) {
          await c.sleep(11_000);
          return null;
        }
        return null;
      });
      const client = new RiotApiClient({ apiKey: "k", fetchImpl, limiter: new RateLimiter([{ requests: 100, seconds: 120 }], c.now, c.sleep), now: c.now, sleep: c.sleep, maxRetries: 0, deadline });
      const r = await syncAccount(db, client, account, { maxMatchesPerRun: 20, outOfTime: () => c.now() > deadline });
      expect(r.outOfTime).toBe(true);
      expect(r.error).toBeUndefined();
      expect(await stored(account.id)).toMatchObject({ syncStatus: "ok", syncError: null, syncCursor: 7 });
      expect((await credential())?.lastOutcome).not.toBe("error");
    });
  }

  it("a rate limit on a lookup is not Riot failing: a Retry-After that leaves no time is a stop for time", async () => {
    // A Refresh's client does not retry: the 429 is thrown at once, and the next request finds the
    // key paused past the deadline.
    const db = handle.db;
    const player = await createPlayer(db, teamId, { displayName: "Rate Limited", primaryRole: "TOP", primaryPool: ["Gwen"] });
    const added = await addAccount(db, { ownerType: "player", playerId: player.id, riotId: "Rate Limited#OCE", platform: "oc1", puuid: "puuid-limited" });
    await db.update(riotAccounts).set({ platformSource: "riot", riotIdCheckedAt: new Date(), syncStatus: "ok", syncCursor: 7 }).where(eq(riotAccounts.id, added.id));
    const account = (await listAccountsForPlayer(db, player.id))[0]!;
    await resetCredential();
    const c = clock();
    const calls: string[] = [];
    const fetchImpl = riotWith(calls, "puuid-limited", (url) => (url.includes("/league/v4/") ? new Response("{}", { status: 429, headers: { "retry-after": "120" } }) : null));
    const client = new RiotApiClient({ apiKey: "k", fetchImpl, limiter: new RateLimiter([{ requests: 100, seconds: 120 }], c.now, c.sleep), now: c.now, sleep: c.sleep, maxRetries: 0, deadline: c.now() + 40_000 });
    const r = await syncAccount(db, client, account, { maxMatchesPerRun: 20 });
    expect(r.outOfTime).toBe(true);
    expect(r.error).toBeUndefined();
    expect(calls).toHaveLength(1);
    expect(await stored(account.id)).toMatchObject({ syncStatus: "ok", syncError: null, syncCursor: 7 });
    expect((await credential())?.lastOutcome).not.toBe("error");
  });

  /** Every queue of the season checked within the last hours and empty: no list is due this run. */
  const nothingDue = () => ({
    season: 16,
    queues: Object.fromEntries(SYNC_QUEUE_IDS.map((q) => [String(q), { offset: 0, done: true, checkedAt: new Date().toISOString() }])),
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
  });
  const nothingDueAccount = async (name: string) => {
    const db = handle.db;
    const puuid = `puuid-${name.replace(/ /g, "-").toLowerCase()}`;
    const player = await createPlayer(db, teamId, { displayName: name, primaryRole: "TOP", primaryPool: ["Gwen"] });
    const added = await addAccount(db, { ownerType: "player", playerId: player.id, riotId: `${name}#OCE`, platform: "oc1", puuid });
    await db.update(riotAccounts).set({ platformSource: "riot", riotIdCheckedAt: new Date(), syncStatus: "ok", syncCursor: 7, historyBackfill: nothingDue(), lastSyncAt: new Date(Date.now() - 6 * 3600_000) }).where(eq(riotAccounts.id, added.id));
    return { puuid, account: (await listAccountsForPlayer(db, player.id))[0]! };
  };

  it("no list due and time running out after lookups Riot answered: a sync like any other", async () => {
    const db = handle.db;
    const { puuid, account } = await nothingDueAccount("Nothing Due");
    const c = clock();
    const deadline = c.now() + 10_000;
    const calls: string[] = [];
    const fetchImpl = riotWith(calls, puuid, async (url) => {
      if (url.includes("/champion-mastery/")) await c.sleep(11_000);
      return null;
    });
    const client = new RiotApiClient({ apiKey: "k", fetchImpl, limiter: new RateLimiter([{ requests: 100, seconds: 120 }], c.now, c.sleep), now: c.now, sleep: c.sleep, maxRetries: 0, deadline });
    const r = await syncAccount(db, client, account, { maxMatchesPerRun: 20, season: 16, outOfTime: () => c.now() > deadline });
    expect(calls.some((u) => u.includes("/ids?"))).toBe(false);
    expect(r.error).toBeUndefined();
    expect(r.outOfTime).toBeFalsy();
    const row = await stored(account.id);
    expect(row.syncStatus).toBe("ok");
    expect(row.syncCursor).not.toBe(7);
  });

  it("no list due and Riot failing on the lookups as time runs out: a failure, as Riot's last word was", async () => {
    const db = handle.db;
    const { puuid, account } = await nothingDueAccount("Nothing Due Failing");
    await resetCredential();
    const c = clock();
    const deadline = c.now() + 10_000;
    const calls: string[] = [];
    const fetchImpl = riotWith(calls, puuid, async (url) => {
      if (!url.includes("/league/v4/") && !url.includes("/champion-mastery/")) return null;
      await c.sleep(6_000);
      return json({ status: { message: "Service unavailable", status_code: 503 } }, 503);
    });
    const client = new RiotApiClient({ apiKey: "k", fetchImpl, limiter: new RateLimiter([{ requests: 100, seconds: 120 }], c.now, c.sleep), now: c.now, sleep: c.sleep, maxRetries: 0, deadline });
    const r = await syncAccount(db, client, account, { maxMatchesPerRun: 20, season: 16, outOfTime: () => c.now() > deadline });
    expect(r).toMatchObject({ status: "pending", outOfTime: true });
    expect(r.error).toMatch(/Riot's servers/);
    expect(await stored(account.id)).toMatchObject({ syncStatus: "pending", syncCursor: 7 });
    expect((await credential())?.lastOutcome).toBe("error");
  });

  it("no list due and the lookups failing with time to spare: best-effort lookups, the sync goes through as before", async () => {
    const db = handle.db;
    const { puuid, account } = await nothingDueAccount("Nothing Due Untimed");
    const calls: string[] = [];
    const fetchImpl = riotWith(calls, puuid, (url) => (url.includes("/league/v4/") || url.includes("/champion-mastery/") ? json({ status: { message: "Service unavailable", status_code: 503 } }, 503) : null));
    const c = clock();
    const client = new RiotApiClient({ apiKey: "k", fetchImpl, limiter: new RateLimiter([{ requests: 100, seconds: 120 }], c.now, c.sleep), now: c.now, sleep: c.sleep, maxRetries: 0 });
    const r = await syncAccount(db, client, account, { maxMatchesPerRun: 20, season: 16 });
    expect(r.error).toBeUndefined();
    expect((await stored(account.id)).syncStatus).toBe("ok");
  });

  it("no time for a season list that was due, and no failure: a stop for time, and the account is not marked synced", async () => {
    // Rank and mastery take the window's two requests; the list would wait for the window, past
    // the deadline. The run's own budget has not run out (no outOfTime): only the client's has.
    const db = handle.db;
    const player = await createPlayer(db, teamId, { displayName: "List Unread", primaryRole: "TOP", primaryPool: ["Gwen"] });
    const added = await addAccount(db, { ownerType: "player", playerId: player.id, riotId: "List Unread#OCE", platform: "oc1", puuid: "puuid-unread" });
    const lastSyncAt = new Date(Date.now() - 6 * 3600_000);
    await db.update(riotAccounts).set({ platformSource: "riot", riotIdCheckedAt: new Date(), syncStatus: "ok", syncCursor: 7, lastSyncAt }).where(eq(riotAccounts.id, added.id));
    const account = (await listAccountsForPlayer(db, player.id))[0]!;
    const c = clock();
    const calls: string[] = [];
    const client = new RiotApiClient({ apiKey: "k", fetchImpl: fakeRiot(calls, { puuid: "puuid-unread" }), limiter: new RateLimiter([{ requests: 2, seconds: 120 }], c.now, c.sleep), now: c.now, sleep: c.sleep, maxRetries: 4, deadline: c.now() + 20_000 });
    const r = await syncAccount(db, client, account, { maxMatchesPerRun: 20 });
    expect(r.outOfTime).toBe(true);
    expect(r.error).toBeUndefined();
    expect(calls.some((u) => u.includes("/ids?"))).toBe(false);
    const row = await stored(account.id);
    expect(row).toMatchObject({ syncStatus: "ok", syncError: null, syncCursor: 7 });
    expect(row.lastSyncAt?.getTime()).toBe(lastSyncAt.getTime());
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
