import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";
import { FixtureStaticProvider } from "@/server/riot/static/fixture";
import { syncStaticData } from "@/server/riot/static/sync";
import { createPlayer, getOrCreateTeam } from "@/server/repositories/team";
import { addAccount } from "@/server/accounts/repository";
import { RiotApiClient } from "@/server/riot/api/client";
import { RateLimiter } from "@/server/riot/api/rate-limiter";
import { REFRESH_COOLDOWN_MS, SCHEDULED_SYNC_LEASE_MS, claimAccountSync, getMatchSyncStatus, refreshPlayerMatches } from "@/server/accounts/refresh";
import { loadSeasonGames } from "@/server/players/season-games";
import { gamesFor, modeBreakdown } from "@/domain/season-stats";
import fixture from "@/server/riot/fixtures/champions.fixture.json";

const keyOf = (id: string) => fixture.champions.find((c) => c.id === id)!.key;
type Spec = { champion: string; role: string; win: boolean; queue: number; created: number };

/** Riot as the sync sees it: a game list per queue (newest first) and the games themselves. */
function fakeRiot(puuid: string, matches: Record<string, Spec>, calls: string[]) {
  return async (input: string | URL | Request): Promise<Response> => {
    const url = String(input);
    calls.push(url);
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
    if (url.includes("/riot/account/v1/region/by-game/lol/by-puuid/")) return json({ puuid, game: "lol", region: "OC1" });
    if (url.includes("/riot/account/v1/accounts/by-riot-id/")) {
      const parts = url.split("/by-riot-id/")[1]!.split("/");
      return json({ puuid, gameName: decodeURIComponent(parts[0]!), tagLine: decodeURIComponent(parts[1]!) });
    }
    if (url.includes("/lol/league/v4/entries/by-puuid/")) return json([]);
    if (url.includes("/lol/champion-mastery/v4/")) return json([]);
    if (url.includes("/ids?")) {
      const q = new URL(url).searchParams;
      const queue = Number(q.get("queue"));
      const startTime = Number(q.get("startTime") ?? 0) * 1000;
      const start = Number(q.get("start") ?? 0);
      const count = Number(q.get("count") ?? 20);
      const ids = Object.entries(matches)
        .filter(([, m]) => m.queue === queue && m.created >= startTime)
        .sort((a, b) => b[1].created - a[1].created)
        .map(([id]) => id);
      return json(ids.slice(start, start + count));
    }
    const m = /\/lol\/match\/v5\/matches\/([^/?]+)$/.exec(url);
    if (m) {
      const spec = matches[decodeURIComponent(m[1]!)];
      if (!spec) return json({}, 404);
      const positions = ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"];
      const participants = Array.from({ length: 10 }, (_, i) => ({ puuid: i === 0 ? puuid : `other-${i}`, teamId: i < 5 ? 100 : 200, championId: i === 0 ? keyOf(spec.champion) : keyOf("Ahri") + i, teamPosition: i === 0 ? spec.role : positions[i % 5], win: i < 5 ? spec.win : !spec.win, kills: 2, deaths: 3, assists: 4, totalMinionsKilled: 150, neutralMinionsKilled: 10, totalDamageDealtToChampions: 20000, visionScore: 20 }));
      return json({ metadata: { matchId: m[1] }, info: { gameCreation: spec.created, gameDuration: 1800, gameVersion: "16.19.1.1", queueId: spec.queue, teams: [], participants } });
    }
    return json({}, 404);
  };
}

let handle: DbHandle;
beforeAll(async () => {
  handle = await testDb();
  await syncStaticData(handle.db, new FixtureStaticProvider(), { fingerprint: false });
});
afterAll(async () => {
  await handle.close();
});

describe("Match History refresh", () => {
  it("finds new games once, honours the per-account cooldown, and the scheduler stands aside", async () => {
    const db = handle.db;
    const team = await getOrCreateTeam(db);
    const player = await createPlayer(db, team.id, { displayName: "Refresher", primaryRole: "MID", primaryPool: ["Ahri"] });
    const account = await addAccount(db, { ownerType: "player", playerId: player.id, riotId: "Refresher#OCE", platform: "oc1" });
    let clock = Date.UTC(2026, 9, 17, 3, 0, 0);
    const now = () => new Date(clock);
    const day = 86_400_000;
    const matches: Record<string, Spec> = {
      OC1_F1: { champion: "Ahri", role: "MIDDLE", win: true, queue: 440, created: clock - 2 * day },
      OC1_F2: { champion: "Orianna", role: "MIDDLE", win: false, queue: 440, created: clock - 3 * day },
      OC1_S1: { champion: "Ahri", role: "MIDDLE", win: true, queue: 420, created: clock - 4 * day },
    };
    const calls: string[] = [];
    const client = new RiotApiClient({ apiKey: "k", fetchImpl: fakeRiot("puuid-refresh", matches, calls), limiter: new RateLimiter([{ requests: 1000, seconds: 1 }]), sleep: async () => {} });

    // First refresh: the three games are new (two Ranked Flex, one Solo/Duo).
    const first = await refreshPlayerMatches(db, client, player.id, { now });
    expect(first).toMatchObject({ status: "updated", newGames: 3 });
    const status = await getMatchSyncStatus(db, player.id);
    expect(status.accounts).toBe(1);
    expect(status.checkedAt).not.toBeNull();
    expect(status.newestGameAt).toBe(new Date(matches.OC1_F1!.created).toISOString());

    // Ranked Flex games are counted under Ranked Flex and in All supported games.
    const games = await loadSeasonGames(db, [account.id]);
    expect(gamesFor(games, { season: 16, mode: "flex" }).map((g) => g.matchId).sort()).toEqual(["OC1_F1", "OC1_F2"]);
    expect(gamesFor(games, { season: 16, mode: "all" })).toHaveLength(3);
    expect(modeBreakdown(games, { season: 16, mode: "flex", accountId: null }).counts).toMatchObject({ all: 3, solo: 1, flex: 2, normal: 0 });

    // An immediate second click asks Riot nothing and says when it may try again.
    const before = calls.length;
    const second = await refreshPlayerMatches(db, client, player.id, { now });
    expect(second.status).toBe("recent");
    if (second.status === "recent") expect(second.retryInSeconds).toBeLessThanOrEqual(REFRESH_COOLDOWN_MS / 1000);
    expect(calls.length).toBe(before);
    // The scheduled sync skips the account a refresh just claimed.
    expect(await claimAccountSync(db, account.id, SCHEDULED_SYNC_LEASE_MS, now())).toBe(false);

    // After the cooldown, nothing new is an honest "no new games".
    clock += REFRESH_COOLDOWN_MS + 1_000;
    expect((await refreshPlayerMatches(db, client, player.id, { now })).status).toBe("no-new");

    // A game that Riot lists later is found by the next refresh.
    clock += REFRESH_COOLDOWN_MS + 1_000;
    matches.OC1_F3 = { champion: "Ahri", role: "MIDDLE", win: true, queue: 440, created: clock - 60_000 };
    expect(await refreshPlayerMatches(db, client, player.id, { now })).toMatchObject({ status: "updated", newGames: 1 });
  });

  it("explains a profile without a linked account instead of pretending to refresh", async () => {
    const db = handle.db;
    const team = await getOrCreateTeam(db);
    const player = await createPlayer(db, team.id, { displayName: "No Account", primaryRole: "TOP", primaryPool: ["Gwen"] });
    const client = new RiotApiClient({ apiKey: "k", fetchImpl: fakeRiot("unused", {}, []), limiter: new RateLimiter([{ requests: 1000, seconds: 1 }]), sleep: async () => {} });
    expect((await refreshPlayerMatches(db, client, player.id)).status).toBe("unavailable");
    expect(await getMatchSyncStatus(db, player.id)).toMatchObject({ accounts: 0, checkedAt: null });
  });

  it("shows where a mode's games are when the chosen season has none, never pointing before 2026", () => {
    const g = (matchId: string, queueId: number, patch: string) => ({ matchId, accountId: "a", queueId, championId: "Ahri", role: "MIDDLE", win: true, patch, gameCreation: 1, kills: null, deaths: null, assists: null, cs: null, damage: null, visionScore: null, gameDuration: null });
    const games = [g("X1", 440, "15.20"), g("X2", 440, "15.21"), g("X3", 420, "16.19"), g("X4", 440, "16.18")];
    const { counts, elsewhere } = modeBreakdown(games, { season: 17, mode: "flex", accountId: null });
    expect(counts).toMatchObject({ all: 0, solo: 0, flex: 0 });
    // Season 2026 holds a Flex game; the two from 2025 are not offered, so not pointed to.
    expect(elsewhere).toEqual([{ season: 16, games: 1 }]);
  });
});
