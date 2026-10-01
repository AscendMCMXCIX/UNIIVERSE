import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";
import { accountChampionHistory, accountMatches } from "@/server/db/schema";
import { FixtureStaticProvider } from "@/server/riot/static/fixture";
import { syncStaticData } from "@/server/riot/static/sync";
import { createPlayer, getOrCreateTeam } from "@/server/repositories/team";
import { AccountError, addAccount, listAccountsForPlayer, parseRiotId } from "@/server/accounts/repository";
import { syncAccount } from "@/server/accounts/sync";
import { RiotApiClient } from "@/server/riot/api/client";
import { RateLimiter } from "@/server/riot/api/rate-limiter";
import { getProficiencyLookup, invalidateProficiencyCache } from "@/server/proficiency/service";
import fixture from "@/server/riot/fixtures/champions.fixture.json";

const keyOf = (id: string) => fixture.champions.find((c) => c.id === id)!.key;
let handle: DbHandle;
beforeAll(async () => {
  handle = await testDb();
  await syncStaticData(handle.db, new FixtureStaticProvider(), { fingerprint: false });
});
afterAll(async () => {
  await handle.close();
});

function fakeFetch(puuid: string, matches: Record<string, { champion: string; role: string; win: boolean; queue: number; created: number }>) {
  return async (input: string | URL | Request): Promise<Response> => {
    const url = String(input);
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
    if (url.includes("/riot/account/v1/accounts/by-riot-id/")) {
      if (url.includes("Unknown")) return json({ status: { message: "not found" } }, 404);
      const parts = url.split("/by-riot-id/")[1]!.split("/");
      return json({ puuid, gameName: decodeURIComponent(parts[0]!), tagLine: decodeURIComponent(parts[1]!) });
    }
    if (url.includes("/lol/league/v4/entries/by-puuid/")) return json([{ queueType: "RANKED_SOLO_5x5", tier: "DIAMOND", rank: "II", leaguePoints: 40, wins: 120, losses: 100 }]);
    if (url.includes("/lol/champion-mastery/v4/")) return json([{ championId: keyOf("Gwen"), championLevel: 7, championPoints: 300000, lastPlayTime: Date.now() }]);
    if (url.includes("/ids?")) return json(Object.keys(matches));
    const m = /\/lol\/match\/v5\/matches\/([^/?]+)$/.exec(url);
    if (m) {
      const spec = matches[decodeURIComponent(m[1]!)];
      if (!spec) return json({}, 404);
      const positions = ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"];
      const participants = Array.from({ length: 10 }, (_, i) => ({ puuid: i === 0 ? puuid : `other-${i}`, teamId: i < 5 ? 100 : 200, championId: i === 0 ? keyOf(spec.champion) : keyOf("Ahri") + i, teamPosition: i === 0 ? spec.role : positions[i % 5], win: i < 5 ? spec.win : !spec.win, kills: 1, deaths: 1, assists: 1 }));
      return json({ metadata: { matchId: m[1] }, info: { gameCreation: spec.created, gameDuration: 1800, gameVersion: "15.19.1.1", queueId: spec.queue, teams: [], participants } });
    }
    return json({}, 404);
  };
}

describe("riot accounts", () => {
  it("parses Riot IDs exactly, including Unicode and symbols", () => {
    expect(parseRiotId("Ünïcode Näme#EUW")).toEqual({ gameName: "Ünïcode Näme", tagLine: "EUW" });
    expect(parseRiotId("  敵のトップ #KR1 ")).toEqual({ gameName: "敵のトップ", tagLine: "KR1" });
    expect(parseRiotId("no tag")).toBeNull();
    expect(parseRiotId("#tagonly")).toBeNull();
  });

  it("prevents the same Riot ID from being linked twice (across players and opponents)", async () => {
    const db = handle.db;
    const team = await getOrCreateTeam(db);
    const a = await createPlayer(db, team.id, { displayName: "A", primaryRole: "TOP", primaryPool: ["Gwen"] }, team.poolLimits);
    const b = await createPlayer(db, team.id, { displayName: "B", primaryRole: "MID", primaryPool: ["Ahri"] }, team.poolLimits);
    await addAccount(db, { ownerType: "player", playerId: a.id, riotId: "Ünïcode Näme#EUW", platform: "euw1" });
    await expect(addAccount(db, { ownerType: "player", playerId: b.id, riotId: "Ünïcode Näme#EUW", platform: "euw1" })).rejects.toBeInstanceOf(AccountError);
    await expect(addAccount(db, { ownerType: "opponent", opponentPlayerId: null, riotId: "Ünïcode Näme#EUW", platform: "euw1" })).rejects.toBeInstanceOf(AccountError);
    const stored = (await listAccountsForPlayer(db, a.id))[0]!;
    expect(stored.gameName).toBe("Ünïcode Näme");
  });

  it("syncs an account incrementally, folds each match once and feeds proficiency", async () => {
    const db = handle.db;
    const team = await getOrCreateTeam(db);
    const player = await createPlayer(db, team.id, { displayName: "Synced", primaryRole: "TOP", primaryPool: ["Gwen", "Jax"] }, team.poolLimits);
    const account = await addAccount(db, { ownerType: "player", playerId: player.id, riotId: "Synced Player#EUW", platform: "euw1" });
    const now = Date.now();
    const matches = {
      EUW1_1: { champion: "Gwen", role: "TOP", win: true, queue: 420, created: now - 86_400_000 },
      EUW1_2: { champion: "Gwen", role: "TOP", win: false, queue: 440, created: now - 2 * 86_400_000 },
      EUW1_3: { champion: "Jax", role: "TOP", win: true, queue: 420, created: now - 3 * 86_400_000 },
      EUW1_4: { champion: "Gwen", role: "TOP", win: true, queue: 450, created: now - 4 * 86_400_000 }, // ARAM: ignored
    };
    const client = new RiotApiClient({ apiKey: "k", fetchImpl: fakeFetch("puuid-synced", matches), limiter: new RateLimiter([{ requests: 1000, seconds: 1 }]), sleep: async () => {} });
    const first = await syncAccount(db, client, account);
    expect(first.resolved).toBe(true);
    expect(first.matchesFolded).toBe(3);
    expect(first.rankUpdated).toBe(true);
    const second = await syncAccount(db, client, (await listAccountsForPlayer(db, player.id))[0]!);
    expect(second.matchesFolded).toBe(0);
    expect(await db.select().from(accountMatches)).toHaveLength(4);
    const history = await db.select().from(accountChampionHistory);
    const gwenSolo = history.find((h) => h.championId === "Gwen" && h.queueGroup === "solo");
    expect(gwenSolo?.games).toBe(1);
    expect(history.filter((h) => h.championId === "Gwen").reduce((s, h) => s + h.games, 0)).toBe(2);
    const updated = (await listAccountsForPlayer(db, player.id))[0]!;
    expect(updated.tier).toBe("DIAMOND");
    expect(updated.gameName).toBe("Synced Player");
    expect(updated.puuid).toBe("puuid-synced");

    invalidateProficiencyCache();
    const lookup = await getProficiencyLookup(db, [player.id]);
    const gwen = lookup(player.id, "Gwen", "TOP")!;
    expect(gwen.games).toBe(2);
    expect(gwen.tier).not.toBe("unknown");
    expect(lookup(player.id, "Riven", "TOP")?.tier).toBe("unknown");
  });

  it("marks an unknown Riot ID as unresolved without throwing", async () => {
    const db = handle.db;
    const team = await getOrCreateTeam(db);
    const player = await createPlayer(db, team.id, { displayName: "Ghost", primaryRole: "ADC", primaryPool: ["Jinx"] }, team.poolLimits);
    const account = await addAccount(db, { ownerType: "player", playerId: player.id, riotId: "Unknown Person#XXX", platform: "euw1" });
    const client = new RiotApiClient({ apiKey: "k", fetchImpl: fakeFetch("p", {}), limiter: new RateLimiter([{ requests: 1000, seconds: 1 }]), sleep: async () => {} });
    const r = await syncAccount(db, client, account);
    expect(r.error).toMatch(/not found/i);
    expect((await listAccountsForPlayer(db, player.id))[0]?.syncStatus).toBe("unresolved");
  });
});
