import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, sql } from "drizzle-orm";
import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";
import { riotAccounts } from "@/server/db/schema";
import { FixtureStaticProvider } from "@/server/riot/static/fixture";
import { syncStaticData } from "@/server/riot/static/sync";
import { createPlayer, getOrCreateTeam } from "@/server/repositories/team";
import { addAccount } from "@/server/accounts/repository";
import { VIEW_REFRESH_LEASE_MS, kickoffAccountSync, refreshPlayerAccountsIfDue } from "@/server/accounts/kickoff";
import { ACCOUNT_SYNC_TICK_MS } from "@/server/jobs/scheduler";
import { REFRESH_COOLDOWN_MS, SCHEDULED_SYNC_LEASE_MS, accountSyncLeaseKey, claimAccountSync, refreshPlayerMatches } from "@/server/accounts/refresh";
import { RIOT_REQUEST_TIMEOUT_MS, RiotApiClient } from "@/server/riot/api/client";
import { RateLimiter, RateLimiterPool } from "@/server/riot/api/rate-limiter";

/*
  One sync per account at a time, whoever starts it. The scheduler, a profile's Refresh and Retry
  sync already claimed the per-account lease (account_sync:<id>); a profile view's background
  refresh and the first sync after sign-up did not, so a view and the tick (or Refresh) could sync
  the same account at once: twice the Riot requests on a key allowed 100 per two minutes, and a
  Refresh answering "No new games" because the other sync had just stored them. Both now claim it
  too and leave an account another sync holds to that sync.
*/

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** Riot for these tests: every Riot ID resolves, on OCE, with no rank, mastery or games. */
function quietRiot(calls: string[]) {
  return async (input: string | URL | Request): Promise<Response> => {
    const url = String(input);
    calls.push(url);
    const byId = /\/accounts\/by-riot-id\/([^/]+)\/([^/?]+)/.exec(url);
    if (byId) return json({ puuid: `puuid-${decodeURIComponent(byId[1]!)}`, gameName: decodeURIComponent(byId[1]!), tagLine: decodeURIComponent(byId[2]!) });
    if (url.includes("/region/by-game/")) return json({ puuid: "x", game: "lol", region: "oc1" });
    if (url.includes("/league/v4/") || url.includes("/champion-mastery/") || url.includes("/ids?")) return json([]);
    return json({}, 404);
  };
}

let handle: DbHandle;
let teamId: string;
const calls: string[] = [];
const env = { ...process.env };
const savedPool = globalThis.__uniiverseRiotLimiters;
beforeAll(async () => {
  handle = await testDb();
  await syncStaticData(handle.db, new FixtureStaticProvider(), { fingerprint: false });
  teamId = (await getOrCreateTeam(handle.db)).id;
}, 60_000);
beforeEach(() => {
  // The view refresh and the first sync create their own client: the key from the environment,
  // the process's limiter pool (a roomy one here) and fetch (a stand-in for Riot).
  calls.length = 0;
  process.env.RIOT_API_KEY = "RGAPI-00000000-0000-0000-0000-00000000beef";
  process.env.UNIIVERSE_BACKGROUND_REFRESH = "true";
  vi.stubGlobal("fetch", quietRiot(calls));
  globalThis.__uniiverseRiotLimiters = new RateLimiterPool([{ requests: 1_000, seconds: 1 }]);
});
afterEach(() => {
  vi.unstubAllGlobals();
  globalThis.__uniiverseRiotLimiters = savedPool;
  for (const key of ["RIOT_API_KEY", "UNIIVERSE_BACKGROUND_REFRESH"]) {
    if (env[key] === undefined) delete process.env[key];
    else process.env[key] = env[key];
  }
});
afterAll(async () => {
  await handle.close();
});

const stored = async (accountId: string) => (await handle.db.select().from(riotAccounts).where(eq(riotAccounts.id, accountId)))[0]!;
const asked = (riotIdName: string) => calls.some((u) => u.includes(`/${encodeURIComponent(riotIdName)}/`));
/** Moves a lease's last claim back in time, as if it had been claimed `ms` ago. */
const age = (key: string, ms: number) => handle.db.execute(sql`UPDATE app_settings SET updated_at = now() - make_interval(secs => ${ms / 1000}) WHERE key = ${key}`);
const testClient = () => new RiotApiClient({ apiKey: "k", fetchImpl: quietRiot(calls), limiter: new RateLimiter([{ requests: 1000, seconds: 1 }]), sleep: async () => {}, maxRetries: 0 });

describe("a profile view's refresh", () => {
  it("leaves an account another sync claimed recently to that sync, and asks Riot nothing about it", async () => {
    const db = handle.db;
    const player = await createPlayer(db, teamId, { displayName: "View Held", primaryRole: "TOP", primaryPool: ["Gwen"] });
    const account = await addAccount(db, { ownerType: "player", playerId: player.id, riotId: "View Held#OCE", platform: "oc1" });
    // A Refresh (or the scheduler) is syncing this account right now.
    expect(await claimAccountSync(db, account.id, REFRESH_COOLDOWN_MS)).toBe(true);
    await refreshPlayerAccountsIfDue(db, player.id);
    expect(asked("View Held")).toBe(false);
    expect(await stored(account.id)).toMatchObject({ syncStatus: "never", lastSyncAt: null });
    // Once the lease has passed, that sync is over: the next view's refresh syncs it.
    await age(accountSyncLeaseKey(account.id), SCHEDULED_SYNC_LEASE_MS + 1_000);
    await age(`account_refresh:${player.id}`, 3 * 60_000);
    await refreshPlayerAccountsIfDue(db, player.id);
    expect(asked("View Held")).toBe(true);
    expect((await stored(account.id)).syncStatus).toBe("ok");
  });

  it("a slice that found every account held gives its turn back, so the next render need not wait two minutes", async () => {
    // Review of the leases change: the slice took the player's two-minute lease before it claimed
    // any account, so when the first sync right after sign-up held the account, the slice synced
    // nothing and still kept the next one from starting for two minutes.
    const db = handle.db;
    const player = await createPlayer(db, teamId, { displayName: "View Turn", primaryRole: "TOP", primaryPool: ["Gwen"] });
    const account = await addAccount(db, { ownerType: "player", playerId: player.id, riotId: "View Turn#OCE", platform: "oc1" });
    expect(await claimAccountSync(db, account.id, SCHEDULED_SYNC_LEASE_MS)).toBe(true);
    expect(await refreshPlayerAccountsIfDue(db, player.id)).toBe(0);
    expect(asked("View Turn")).toBe(false);
    // The other sync is over; the player's own slice lease is not aged, yet the next render syncs.
    await age(accountSyncLeaseKey(account.id), SCHEDULED_SYNC_LEASE_MS + 1_000);
    expect(await refreshPlayerAccountsIfDue(db, player.id)).toBe(1);
    expect(asked("View Turn")).toBe(true);
    // That slice did sync, so it keeps its lease: the render after it starts nothing.
    calls.length = 0;
    await age(accountSyncLeaseKey(account.id), SCHEDULED_SYNC_LEASE_MS + 1_000);
    expect(await refreshPlayerAccountsIfDue(db, player.id)).toBe(0);
    expect(calls).toHaveLength(0);
  });

  it("does not join a scheduled sync still running on the account, however long it runs", async () => {
    // Review: the lease was 60 s, but a tick's account sync can hold an account for its 75 s cap
    // plus a request's timeout; a view starting in that gap synced the same account at once.
    expect(SCHEDULED_SYNC_LEASE_MS).toBeGreaterThan(ACCOUNT_SYNC_TICK_MS + RIOT_REQUEST_TIMEOUT_MS);
    // And under a view's slice lease, so a watched account's next slice is not refused by its last.
    expect(SCHEDULED_SYNC_LEASE_MS).toBeLessThan(VIEW_REFRESH_LEASE_MS);
    const db = handle.db;
    const player = await createPlayer(db, teamId, { displayName: "View Long", primaryRole: "TOP", primaryPool: ["Gwen"] });
    const account = await addAccount(db, { ownerType: "player", playerId: player.id, riotId: "View Long#OCE", platform: "oc1" });
    // The tick claimed it this long ago and its last request is still out.
    expect(await claimAccountSync(db, account.id, SCHEDULED_SYNC_LEASE_MS)).toBe(true);
    await age(accountSyncLeaseKey(account.id), ACCOUNT_SYNC_TICK_MS + RIOT_REQUEST_TIMEOUT_MS - 1_000);
    expect(await refreshPlayerAccountsIfDue(db, player.id)).toBe(0);
    expect(asked("View Long")).toBe(false);
  });

  it("claims each account it syncs, so a Refresh or the scheduler started meanwhile leaves it alone", async () => {
    const db = handle.db;
    const player = await createPlayer(db, teamId, { displayName: "View Claims", primaryRole: "TOP", primaryPool: ["Gwen"] });
    const account = await addAccount(db, { ownerType: "player", playerId: player.id, riotId: "View Claims#OCE", platform: "oc1" });
    expect(await refreshPlayerAccountsIfDue(db, player.id)).toBe(1);
    expect((await stored(account.id)).syncStatus).toBe("ok");
    // The scheduler skips it, and a Refresh answers "checked recently" without asking Riot.
    expect(await claimAccountSync(db, account.id, SCHEDULED_SYNC_LEASE_MS)).toBe(false);
    calls.length = 0;
    expect(await refreshPlayerMatches(db, testClient(), player.id)).toMatchObject({ status: "recent" });
    expect(calls).toHaveLength(0);
  });
});

describe("the first sync after sign-up", () => {
  it("syncs a newly linked account at once and claims it", async () => {
    const db = handle.db;
    const player = await createPlayer(db, teamId, { displayName: "Kick New", primaryRole: "TOP", primaryPool: ["Gwen"] });
    const account = await addAccount(db, { ownerType: "player", playerId: player.id, riotId: "Kick New#OCE", platform: "oc1" });
    await kickoffAccountSync(db, player.id);
    expect(asked("Kick New")).toBe(true);
    expect((await stored(account.id)).syncStatus).toBe("ok");
    // A view's refresh or the scheduler starting meanwhile leaves it to the first sync.
    expect(await claimAccountSync(db, account.id, SCHEDULED_SYNC_LEASE_MS)).toBe(false);
  });

  it("leaves an account another sync is on to that sync, and is not kept from it once that sync is over", async () => {
    const db = handle.db;
    const player = await createPlayer(db, teamId, { displayName: "Kick Held", primaryRole: "TOP", primaryPool: ["Gwen"] });
    const free = await addAccount(db, { ownerType: "player", playerId: player.id, riotId: "Kick Free#OCE", platform: "oc1" });
    const held = await addAccount(db, { ownerType: "player", playerId: player.id, riotId: "Kick Held#OCE", platform: "oc1" });
    // The player opened their profile before the first sync started: its refresh holds one account.
    expect(await claimAccountSync(db, held.id, SCHEDULED_SYNC_LEASE_MS)).toBe(true);
    await kickoffAccountSync(db, player.id);
    expect(asked("Kick Free")).toBe(true);
    expect(asked("Kick Held")).toBe(false);
    expect((await stored(free.id)).syncStatus).toBe("ok");
    expect((await stored(held.id)).syncStatus).toBe("never");
    // The lease only defers: once it has passed, the account is synced like any other.
    await age(accountSyncLeaseKey(held.id), SCHEDULED_SYNC_LEASE_MS + 1_000);
    await kickoffAccountSync(db, player.id);
    expect(asked("Kick Held")).toBe(true);
    expect((await stored(held.id)).syncStatus).toBe("ok");
  });
});
