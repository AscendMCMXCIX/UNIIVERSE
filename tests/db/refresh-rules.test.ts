import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";
import { riotAccounts } from "@/server/db/schema";
import { FixtureStaticProvider } from "@/server/riot/static/fixture";
import { syncStaticData } from "@/server/riot/static/sync";
import { createPlayer, getOrCreateTeam } from "@/server/repositories/team";
import { addAccount } from "@/server/accounts/repository";
import { pendingFiguresForPlayer } from "@/server/accounts/figures-backfill";
import { RiotApiClient } from "@/server/riot/api/client";
import { RateLimiter } from "@/server/riot/api/rate-limiter";
import { REFRESH_COOLDOWN_MS, accountSyncRetryIn, claimAccountSync, getMatchSyncStatus, refreshAvailable, refreshPlayerMatches } from "@/server/accounts/refresh";
import { browserTestRiotClient } from "@/server/riot/browser-test";
import { REFRESH_COOLDOWN_SECONDS } from "@/domain/refresh";
import fixture from "@/server/riot/fixtures/champions.fixture.json";

/*
  The rules every Refresh shares (components/ui/refresh-store.ts, server/accounts/refresh.ts): demo
  accounts are never asked, a failed attempt is told apart from the last successful read, Retry sync
  and Refresh share one cooldown per account, and the browser tests' stand-in for Riot answers only
  for its own made-up accounts, only on the in-memory demo database.
*/

const keyOf = (id: string) => Number(fixture.champions.find((c) => c.id === id)!.key);

/** Riot that records every request and answers nothing new, one Ranked Flex game once `flexGame` is set, or, when down, an error. */
function quietRiot(calls: string[], state: { down: boolean; flexGame?: number }, puuid = "puuid-rules") {
  return async (input: string | URL | Request): Promise<Response> => {
    const url = String(input);
    calls.push(url);
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
    if (state.down) return json({ status: { message: "Service unavailable" } }, 503);
    if (url.includes("/riot/account/v1/region/by-game/lol/by-puuid/")) return json({ puuid, game: "lol", region: "oc1" });
    if (url.includes("/ids?")) return json(state.flexGame && new URL(url).searchParams.get("queue") === "440" ? ["OC1_7700001"] : []);
    if (url.includes("/lol/league/v4/entries/by-puuid/") || url.includes("/lol/champion-mastery/v4/")) return json([]);
    if (state.flexGame && url.endsWith("/lol/match/v5/matches/OC1_7700001")) {
      const participants = Array.from({ length: 10 }, (_, i) => ({ puuid: i === 0 ? puuid : `other-${i}`, teamId: i < 5 ? 100 : 200, championId: i === 0 ? keyOf("Gwen") : keyOf("Ahri") + i, teamPosition: "TOP", win: i < 5, kills: 3, deaths: 2, assists: 5, doubleKills: 0, tripleKills: 0, quadraKills: 0, pentaKills: 0 }));
      return json({ metadata: { matchId: "OC1_7700001" }, info: { gameCreation: state.flexGame, gameDuration: 1_700, gameVersion: "16.20.1.1", queueId: 440, teams: [], participants } });
    }
    return json({}, 404);
  };
}

const client = (fetchImpl: ReturnType<typeof quietRiot>) => new RiotApiClient({ apiKey: "k", fetchImpl, limiter: new RateLimiter([{ requests: 1000, seconds: 1 }]), sleep: async () => {}, maxRetries: 0 });

let handle: DbHandle;
const env = { ...process.env };
beforeAll(async () => {
  handle = await testDb();
  await syncStaticData(handle.db, new FixtureStaticProvider(), { fingerprint: false });
});
afterEach(() => {
  for (const key of ["UNIIVERSE_FAKE_RIOT_IDS", "UNIIVERSE_DB_MODE", "VERCEL", "RIOT_API_KEY"]) {
    if (env[key] === undefined) delete process.env[key];
    else process.env[key] = env[key];
  }
});
afterAll(async () => {
  await handle.close();
});

describe("Refresh rules", () => {
  it("never asks Riot about a demo account, and says so when a player has nothing else", async () => {
    const db = handle.db;
    const team = await getOrCreateTeam(db);
    const player = await createPlayer(db, team.id, { displayName: "Sample Only", primaryRole: "MID", primaryPool: ["Ahri"] });
    await db.insert(riotAccounts).values({ ownerType: "player", playerId: player.id, gameName: "Sample Only", tagLine: "DEMO", platform: "euw1", puuid: `demo-${player.id}`, label: "demo", syncStatus: "demo", lastSyncAt: new Date() });
    const calls: string[] = [];
    const outcome = await refreshPlayerMatches(db, client(quietRiot(calls, { down: false })), player.id);
    expect(outcome).toMatchObject({ status: "unavailable", message: expect.stringMatching(/Demo accounts are not read from Riot/) });
    expect(calls).toHaveLength(0);
    // The page then offers no Refresh: nothing Riot can be asked about.
    expect(await getMatchSyncStatus(db, player.id)).toMatchObject({ accounts: 1, syncable: 0 });
  });

  it("tells a failed attempt apart from the last successful read", async () => {
    const db = handle.db;
    const team = await getOrCreateTeam(db);
    const player = await createPlayer(db, team.id, { displayName: "Rules Probe", primaryRole: "TOP", primaryPool: ["Gwen"] });
    const account = await addAccount(db, { ownerType: "player", playerId: player.id, riotId: "Rules Probe#OCE", platform: "oc1" });
    await db.update(riotAccounts).set({ puuid: "puuid-rules", syncStatus: "ok" }).where(eq(riotAccounts.id, account.id));
    let clock = Date.now();
    const now = () => new Date(clock);
    const calls: string[] = [];
    const riot = { down: false };
    const c = client(quietRiot(calls, riot));

    expect((await refreshPlayerMatches(db, c, player.id, { now })).status).toBe("no-new");
    const ok = await getMatchSyncStatus(db, player.id);
    expect(ok).toMatchObject({ accounts: 1, syncable: 1 });
    expect(ok.checkedAt).not.toBeNull();
    expect(ok.attemptedAt).not.toBeNull();

    // Riot down after the cooldown: the attempt moves on, the last successful read stays.
    riot.down = true;
    clock += REFRESH_COOLDOWN_MS + 1_000;
    await new Promise((r) => setTimeout(r, 1_100));
    expect((await refreshPlayerMatches(db, c, player.id, { now })).status).toBe("failed");
    const after = await getMatchSyncStatus(db, player.id);
    expect(after.checkedAt).toBe(ok.checkedAt);
    expect(Date.parse(after.attemptedAt!)).toBeGreaterThan(Date.parse(ok.attemptedAt!));
  });

  it("finds the first game of a queue that had none, on the very next refresh", async () => {
    const db = handle.db;
    const team = await getOrCreateTeam(db);
    const player = await createPlayer(db, team.id, { displayName: "First Flex", primaryRole: "TOP", primaryPool: ["Gwen"] });
    const account = await addAccount(db, { ownerType: "player", playerId: player.id, riotId: "First Flex#OCE", platform: "oc1" });
    await db.update(riotAccounts).set({ puuid: "puuid-first-flex", syncStatus: "ok" }).where(eq(riotAccounts.id, account.id));
    let clock = Date.now();
    const now = () => new Date(clock);
    const riot: { down: boolean; flexGame?: number } = { down: false };
    const c = client(quietRiot([], riot, "puuid-first-flex"));
    // Every queue empty: each is marked so (the scheduler then asks again only twice a day).
    expect((await refreshPlayerMatches(db, c, player.id, { now })).status).toBe("no-new");
    // The first Ranked Flex game of the season, then Refresh after the cooldown: found, not "No new games".
    riot.flexGame = clock - 10 * 60_000;
    clock += REFRESH_COOLDOWN_MS + 1_000;
    expect(await refreshPlayerMatches(db, c, player.id, { now })).toMatchObject({ status: "updated", newGames: 1 });
  });

  it("gives Retry sync and Refresh one cooldown per account, and says how long is left", async () => {
    const db = handle.db;
    const team = await getOrCreateTeam(db);
    const player = await createPlayer(db, team.id, { displayName: "Cooldown Probe", primaryRole: "JUNGLE", primaryPool: ["Vi"] });
    const account = await addAccount(db, { ownerType: "player", playerId: player.id, riotId: "Cooldown Probe#OCE", platform: "oc1" });
    const at = new Date();
    expect(await claimAccountSync(db, account.id, REFRESH_COOLDOWN_MS, at)).toBe(true);
    expect(await claimAccountSync(db, account.id, REFRESH_COOLDOWN_MS, at)).toBe(false);
    const left = await accountSyncRetryIn(db, [account.id], at);
    expect(left).toBeGreaterThanOrEqual(5);
    expect(left).toBeLessThanOrEqual(REFRESH_COOLDOWN_SECONDS);
    // Half way through, half is left.
    expect(await accountSyncRetryIn(db, [account.id], new Date(at.getTime() + REFRESH_COOLDOWN_MS / 2))).toBeLessThanOrEqual(REFRESH_COOLDOWN_SECONDS / 2 + 1);
  });

  it("lets the browser tests' stand-in play Riot only on the in-memory demo database, for its own accounts", async () => {
    delete process.env.RIOT_API_KEY;
    delete process.env.UNIIVERSE_FAKE_RIOT_IDS;
    expect(browserTestRiotClient()).toBeNull();
    expect(refreshAvailable()).toBe(false);
    process.env.UNIIVERSE_FAKE_RIOT_IDS = "1";
    process.env.UNIIVERSE_DB_MODE = "postgres";
    expect(browserTestRiotClient()).toBeNull();
    process.env.UNIIVERSE_DB_MODE = "memory";
    process.env.VERCEL = "1";
    expect(browserTestRiotClient()).toBeNull();
    delete process.env.VERCEL;
    const standIn = browserTestRiotClient();
    expect(standIn).not.toBeNull();
    expect(refreshAvailable()).toBe(true);

    const db = handle.db;
    const team = await getOrCreateTeam(db);
    const player = await createPlayer(db, team.id, { displayName: "Stand In", primaryRole: "MID", primaryPool: ["Ahri"] });
    const account = await addAccount(db, { ownerType: "player", playerId: player.id, riotId: "standin#OCE", platform: "oc1" });
    await db.update(riotAccounts).set({ puuid: "browser-test-standin-oce" }).where(eq(riotAccounts.id, account.id));
    // Three games, with their multikill counts: nothing left for a catch-up.
    expect(await refreshPlayerMatches(db, standIn!, player.id)).toMatchObject({ status: "updated", newGames: 3 });
    expect(await pendingFiguresForPlayer(db, player.id)).toBe(0);
    // The same account straight away: the cooldown, not Riot.
    expect((await refreshPlayerMatches(db, standIn!, player.id)).status).toBe("recent");
  });
});
