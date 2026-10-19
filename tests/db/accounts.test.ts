import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
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

function fakeFetch(puuid: string, matches: Record<string, { champion: string; role: string; win: boolean; queue: number; created: number; version?: string }>, options: { activeRegion?: string | null; down?: boolean; calls?: string[] } = {}) {
  return async (input: string | URL | Request): Promise<Response> => {
    const url = String(input);
    options.calls?.push(url);
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
    if (options.down) return json({ status: { message: "Service unavailable", status_code: 503 } }, 503);
    if (url.includes("/riot/account/v1/region/by-game/lol/by-puuid/")) {
      if (options.activeRegion === null) return json({ status: { message: "not found" } }, 404);
      return json({ puuid, game: "lol", region: options.activeRegion ?? "OC1" });
    }
    if (url.includes("/riot/account/v1/accounts/by-riot-id/")) {
      if (url.includes("Unknown")) return json({ status: { message: "not found" } }, 404);
      const parts = url.split("/by-riot-id/")[1]!.split("/");
      return json({ puuid, gameName: decodeURIComponent(parts[0]!), tagLine: decodeURIComponent(parts[1]!) });
    }
    if (url.includes("/lol/league/v4/entries/by-puuid/")) return json([{ queueType: "RANKED_SOLO_5x5", tier: "DIAMOND", rank: "II", leaguePoints: 40, wins: 120, losses: 100 }]);
    if (url.includes("/lol/champion-mastery/v4/")) return json([{ championId: keyOf("Gwen"), championLevel: 7, championPoints: 300000, lastPlayTime: Date.now() }]);
    if (url.includes("/ids?")) {
      // Like Riot: one queue, newest first, from startTime, paged by start/count.
      const q = new URL(url).searchParams;
      const queue = Number(q.get("queue"));
      const startTime = Number(q.get("startTime") ?? 0) * 1000;
      const endTime = q.get("endTime") ? Number(q.get("endTime")) * 1000 : Infinity;
      const start = Number(q.get("start") ?? 0);
      const count = Number(q.get("count") ?? 20);
      const ids = Object.entries(matches)
        .filter(([, m]) => m.queue === queue && m.created >= startTime && m.created < endTime)
        .sort((a, b) => b[1].created - a[1].created)
        .map(([id]) => id);
      return json(ids.slice(start, start + count));
    }
    const m = /\/lol\/match\/v5\/matches\/([^/?]+)$/.exec(url);
    if (m) {
      const spec = matches[decodeURIComponent(m[1]!)];
      if (!spec) return json({}, 404);
      const positions = ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"];
      const participants = Array.from({ length: 10 }, (_, i) => ({ puuid: i === 0 ? puuid : `other-${i}`, teamId: i < 5 ? 100 : 200, championId: i === 0 ? keyOf(spec.champion) : keyOf("Ahri") + i, teamPosition: i === 0 ? spec.role : positions[i % 5], win: i < 5 ? spec.win : !spec.win, kills: 1, deaths: 1, assists: 1, totalMinionsKilled: 150, neutralMinionsKilled: 30, totalDamageDealtToChampions: 21000, visionScore: 25 }));
      return json({ metadata: { matchId: m[1] }, info: { gameCreation: spec.created, gameDuration: 1800, gameVersion: spec.version ?? "16.19.1.1", queueId: spec.queue, teams: [], participants } });
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
    const a = await createPlayer(db, team.id, { displayName: "A", primaryRole: "TOP", primaryPool: ["Gwen"] });
    const b = await createPlayer(db, team.id, { displayName: "B", primaryRole: "MID", primaryPool: ["Ahri"] });
    await addAccount(db, { ownerType: "player", playerId: a.id, riotId: "Ünïcode Näme#EUW", platform: "euw1" });
    await expect(addAccount(db, { ownerType: "player", playerId: b.id, riotId: "Ünïcode Näme#EUW", platform: "euw1" })).rejects.toBeInstanceOf(AccountError);
    await expect(addAccount(db, { ownerType: "opponent", opponentPlayerId: null, riotId: "Ünïcode Näme#EUW", platform: "euw1" })).rejects.toBeInstanceOf(AccountError);
    const stored = (await listAccountsForPlayer(db, a.id))[0]!;
    expect(stored.gameName).toBe("Ünïcode Näme");
  });

  it("syncs an account incrementally, folds each match once and feeds proficiency", async () => {
    const db = handle.db;
    const team = await getOrCreateTeam(db);
    const player = await createPlayer(db, team.id, { displayName: "Synced", primaryRole: "TOP", primaryPool: ["Gwen", "Jax"] });
    const account = await addAccount(db, { ownerType: "player", playerId: player.id, riotId: "Synced Player#EUW", platform: "euw1" });
    const now = Date.now();
    const matches = {
      EUW1_1: { champion: "Gwen", role: "TOP", win: true, queue: 420, created: now - 86_400_000 },
      EUW1_2: { champion: "Gwen", role: "TOP", win: false, queue: 440, created: now - 2 * 86_400_000 },
      EUW1_3: { champion: "Jax", role: "TOP", win: true, queue: 420, created: now - 3 * 86_400_000 },
      EUW1_4: { champion: "Gwen", role: "TOP", win: true, queue: 450, created: now - 4 * 86_400_000 }, // ARAM: never requested
    };
    const client = new RiotApiClient({ apiKey: "k", fetchImpl: fakeFetch("puuid-synced", matches), limiter: new RateLimiter([{ requests: 1000, seconds: 1 }]), sleep: async () => {} });
    const first = await syncAccount(db, client, account);
    expect(first.resolved).toBe(true);
    expect(first.matchesFolded).toBe(3);
    expect(first.rankUpdated).toBe(true);
    const second = await syncAccount(db, client, (await listAccountsForPlayer(db, player.id))[0]!);
    expect(second.matchesFolded).toBe(0);
    expect(await db.select().from(accountMatches)).toHaveLength(3);
    const history = await db.select().from(accountChampionHistory);
    const gwenSolo = history.find((h) => h.championId === "Gwen" && h.queueGroup === "solo");
    expect(gwenSolo?.games).toBe(1);
    expect(history.filter((h) => h.championId === "Gwen").reduce((s, h) => s + h.games, 0)).toBe(2);
    const updated = (await listAccountsForPlayer(db, player.id))[0]!;
    expect(updated.tier).toBe("DIAMOND");
    expect(updated.gameName).toBe("Synced Player");
    expect(updated.puuid).toBe("puuid-synced");
    expect(updated.puuidResolvedAt).not.toBeNull();
    // Riot said OC1 even though the player selected EUW: Riot's answer wins and is marked as such.
    expect(updated.platform).toBe("oc1");
    expect(updated.platformSource).toBe("riot");
    expect(first.platform).toBe("oc1");

    invalidateProficiencyCache();
    const lookup = await getProficiencyLookup(db, [player.id]);
    const gwen = lookup(player.id, "Gwen", "TOP")!;
    expect(gwen.games).toBe(2);
    expect(gwen.tier).not.toBe("unknown");
    expect(lookup(player.id, "Riven", "TOP")?.tier).toBe("unknown");
  });

  it("collects the whole season over several runs, normals included, new games first, never twice", async () => {
    const db = handle.db;
    const team = await getOrCreateTeam(db);
    const player = await createPlayer(db, team.id, { displayName: "Season", primaryRole: "MID", primaryPool: ["Ahri"] });
    let account = await addAccount(db, { ownerType: "player", playerId: player.id, riotId: "Season Player#OCE", platform: "oc1" });
    const now = Date.UTC(2026, 9, 14);
    const day = 86_400_000;
    const matches: Record<string, { champion: string; role: string; win: boolean; queue: number; created: number; version?: string }> = {};
    // 130 Solo/Duo games, 30 Normal Draft, 12 Swiftplay this season; 5 from last season (2025).
    for (let i = 0; i < 130; i++) matches[`OC1_S${i}`] = { champion: i % 3 ? "Ahri" : "Syndra", role: "MID", win: i % 2 === 0, queue: 420, created: now - (i + 1) * day * 2, version: "16.10.1.1" };
    for (let i = 0; i < 30; i++) matches[`OC1_N${i}`] = { champion: "Ahri", role: "MID", win: true, queue: 400, created: now - (i + 1) * day * 3, version: "16.8.1.1" };
    for (let i = 0; i < 12; i++) matches[`OC1_W${i}`] = { champion: "Orianna", role: "MID", win: false, queue: 480, created: now - (i + 1) * day, version: "16.19.1.1" };
    for (let i = 0; i < 5; i++) matches[`OC1_OLD${i}`] = { champion: "Ahri", role: "MID", win: true, queue: 420, created: Date.UTC(2025, 11, 20 + i), version: "15.24.1.1" };
    const client = new RiotApiClient({ apiKey: "k", fetchImpl: fakeFetch("puuid-season", matches), limiter: new RateLimiter([{ requests: 10_000, seconds: 1 }]), sleep: async () => {} });
    const opts = { season: 16, maxMatchesPerRun: 60, now: () => new Date(now) };
    const runs = [];
    for (let i = 0; i < 6; i++) {
      runs.push(await syncAccount(db, client, account, opts));
      account = (await listAccountsForPlayer(db, player.id)).find((a) => a.id === account.id)!;
      if (runs.at(-1)!.history?.complete) break;
    }
    // 172 season games at 60 per run: three runs, complete on the last one, nothing fetched twice.
    // The previous season (2025) is before the first offered season, so it is not collected.
    expect(runs.map((r) => r.matchesFolded)).toEqual([60, 60, 52]);
    expect(runs.at(-1)!.history).toMatchObject({ season: 16, complete: true });
    const stored = await db.select().from(accountMatches).where(eq(accountMatches.accountId, account.id));
    expect(stored).toHaveLength(172);
    expect(stored.filter((m) => m.queueId === 400 || m.queueId === 480)).toHaveLength(42);
    expect(stored.filter((m) => m.matchId.startsWith("OC1_OLD"))).toHaveLength(0);
    expect(account.historyBackfill?.previous).toBeUndefined();
    // A new game after completion is picked up by the next run, and only that game.
    matches.OC1_NEW = { champion: "Ahri", role: "MID", win: true, queue: 420, created: now + 3_600_000, version: "16.20.1.1" };
    const next = await syncAccount(db, client, account, { ...opts, now: () => new Date(now + 2 * 3_600_000) });
    expect(next.matchesFolded).toBe(1);
    expect(next.history?.complete).toBe(true);
    // Once Season 2027 opens, spare budget reads Season 2026 back (it is offered), and finds every
    // game already stored.
    account = (await listAccountsForPlayer(db, player.id)).find((a) => a.id === account.id)!;
    const later = await syncAccount(db, client, account, { ...opts, season: 17, now: () => new Date(Date.UTC(2027, 0, 20)) });
    expect(later.matchesFolded).toBe(0);
    account = (await listAccountsForPlayer(db, player.id)).find((a) => a.id === account.id)!;
    expect(account.historyBackfill?.previous).toMatchObject({ season: 16 });
  });

  it("keeps the player's region when Riot cannot report an active server, and never fails sign-up when Riot is down", async () => {
    const db = handle.db;
    const team = await getOrCreateTeam(db);
    const player = await createPlayer(db, team.id, { displayName: "Offline", primaryRole: "MID", primaryPool: ["Ahri"] });
    const account = await addAccount(db, { ownerType: "player", playerId: player.id, riotId: "Offline Player#OCE", platform: "oc1" });
    // Riot down: the account is saved and marked pending with a human sentence, no HTTP code.
    const down = new RiotApiClient({ apiKey: "k", fetchImpl: fakeFetch("puuid-offline", {}, { down: true }), limiter: new RateLimiter([{ requests: 1000, seconds: 1 }]), sleep: async () => {}, maxRetries: 0 });
    const r1 = await syncAccount(db, down, account);
    expect(r1.status).toBe("pending");
    expect(r1.error).toMatch(/retried automatically/);
    expect(r1.error).not.toMatch(/\b503\b/);
    let stored = (await listAccountsForPlayer(db, player.id))[0]!;
    expect(stored.syncStatus).toBe("pending");
    expect(stored.resolveAttempts).toBe(1);
    expect(stored.puuid).toBeNull();
    // Riot back, but the active-region lookup answers 404: the selected region stays, marked "user".
    const partial = new RiotApiClient({ apiKey: "k", fetchImpl: fakeFetch("puuid-offline", {}, { activeRegion: null }), limiter: new RateLimiter([{ requests: 1000, seconds: 1 }]), sleep: async () => {} });
    const r2 = await syncAccount(db, partial, stored);
    expect(r2.status).toBe("ok");
    stored = (await listAccountsForPlayer(db, player.id))[0]!;
    expect(stored.platform).toBe("oc1");
    expect(stored.platformSource).toBe("user");
    expect(stored.resolveAttempts).toBe(0);
    expect(stored.puuid).toBe("puuid-offline");
  });

  it("combines several accounts of one player, deduplicated by PUUID, without counting a game twice", async () => {
    const db = handle.db;
    const team = await getOrCreateTeam(db);
    const player = await createPlayer(db, team.id, { displayName: "Multi", primaryRole: "ADC", primaryPool: ["Jinx", "Kaisa"] });
    const main = await addAccount(db, { ownerType: "player", playerId: player.id, riotId: "Multi Main#OCE", platform: "oc1", label: "main" });
    const alt = await addAccount(db, { ownerType: "player", playerId: player.id, riotId: "Multi Alt#OCE", platform: "oc1", label: "alt" });
    const renamed = await addAccount(db, { ownerType: "player", playerId: player.id, riotId: "Multi Renamed#OCE", platform: "oc1", label: "alt" });
    const now = Date.now();
    const mainGames = { OC1_M1: { champion: "Jinx", role: "BOTTOM", win: true, queue: 420, created: now - 86_400_000 }, OC1_M2: { champion: "Jinx", role: "BOTTOM", win: false, queue: 420, created: now - 2 * 86_400_000 } };
    const altGames = { OC1_A1: { champion: "Jinx", role: "BOTTOM", win: true, queue: 440, created: now - 3 * 86_400_000 }, OC1_A2: { champion: "Kaisa", role: "BOTTOM", win: true, queue: 420, created: now - 4 * 86_400_000 } };
    const limiter = new RateLimiter([{ requests: 1000, seconds: 1 }]);
    await syncAccount(db, new RiotApiClient({ apiKey: "k", fetchImpl: fakeFetch("puuid-main", mainGames), limiter, sleep: async () => {} }), main);
    await syncAccount(db, new RiotApiClient({ apiKey: "k", fetchImpl: fakeFetch("puuid-alt", altGames), limiter, sleep: async () => {} }), alt);
    // The third Riot ID resolves to the main account's PUUID (a rename): flagged, never double counted.
    const dup = await syncAccount(db, new RiotApiClient({ apiKey: "k", fetchImpl: fakeFetch("puuid-main", mainGames), limiter, sleep: async () => {} }), renamed);
    expect(dup.status).toBe("failed");
    expect(dup.error).toMatch(/same Riot account/);
    invalidateProficiencyCache();
    const lookup = await getProficiencyLookup(db, [player.id]);
    const jinx = lookup(player.id, "Jinx", "ADC")!;
    expect(jinx.games).toBe(3); // 2 on main + 1 on alt, nothing from the duplicate
    expect(jinx.roleGames).toBe(3);
    expect(jinx.patchGames).toBe(3); // the fixture's current patch is 15.19, the matches' patch
    expect(lookup(player.id, "Kaisa", "ADC")!.games).toBe(1);
    // Re-syncing both accounts changes nothing: the ledger prevents double counting.
    await syncAccount(db, new RiotApiClient({ apiKey: "k", fetchImpl: fakeFetch("puuid-main", mainGames), limiter, sleep: async () => {} }), (await listAccountsForPlayer(db, player.id)).find((a) => a.id === main.id)!);
    invalidateProficiencyCache();
    expect((await getProficiencyLookup(db, [player.id]))(player.id, "Jinx", "ADC")!.games).toBe(3);
  });

  it("marks an unknown Riot ID as unresolved without throwing", async () => {
    const db = handle.db;
    const team = await getOrCreateTeam(db);
    const player = await createPlayer(db, team.id, { displayName: "Ghost", primaryRole: "ADC", primaryPool: ["Jinx"] });
    const account = await addAccount(db, { ownerType: "player", playerId: player.id, riotId: "Unknown Person#XXX", platform: "euw1" });
    const client = new RiotApiClient({ apiKey: "k", fetchImpl: fakeFetch("p", {}), limiter: new RateLimiter([{ requests: 1000, seconds: 1 }]), sleep: async () => {} });
    const r = await syncAccount(db, client, account);
    expect(r.error).toMatch(/could not find this Riot ID/i);
    expect(r.error).not.toMatch(/\b404\b/);
    expect(r.status).toBe("unresolved");
    expect((await listAccountsForPlayer(db, player.id))[0]?.syncStatus).toBe("unresolved");
  });

  it("stores per-game KDA, CS, damage and vision, and fills them in once for older games", async () => {
    const db = handle.db;
    const team = await getOrCreateTeam(db);
    const player = await createPlayer(db, team.id, { displayName: "Perf", primaryRole: "TOP", primaryPool: ["Gwen"] });
    const account = await addAccount(db, { ownerType: "player", playerId: player.id, riotId: "Perf#OCE", platform: "oc1" });
    const now = Date.now();
    const matches = {
      OC1_P1: { champion: "Gwen", role: "TOP", win: true, queue: 420, created: now - 86_400_000 },
      OC1_P2: { champion: "Gwen", role: "TOP", win: false, queue: 420, created: now - 2 * 86_400_000 },
    };
    const calls: string[] = [];
    const client = new RiotApiClient({ apiKey: "k", fetchImpl: fakeFetch("puuid-perf", matches, { calls }), limiter: new RateLimiter([{ requests: 1000, seconds: 1 }]), sleep: async () => {} });
    await syncAccount(db, client, account);
    const rows = await db.select().from(accountMatches).where(eq(accountMatches.accountId, account.id));
    expect(rows.find((r) => r.matchId === "OC1_P1")).toMatchObject({ kills: 1, deaths: 1, assists: 1, cs: 180, damage: 21000, visionScore: 25 });
    // Simulate games stored before the columns existed, plus one Riot no longer serves.
    await db.update(accountMatches).set({ kills: null, deaths: null, assists: null, cs: null, damage: null, visionScore: null }).where(eq(accountMatches.accountId, account.id));
    await db.insert(accountMatches).values({ accountId: account.id, matchId: "OC1_GONE", gameCreation: now - 5 * 86_400_000, queueId: 420, championId: "Gwen", role: "TOP", win: true, patch: "16.19" });
    calls.length = 0;
    await syncAccount(db, client, (await listAccountsForPlayer(db, player.id))[0]!);
    const after = await db.select().from(accountMatches).where(eq(accountMatches.accountId, account.id));
    expect(after.find((r) => r.matchId === "OC1_P2")).toMatchObject({ kills: 1, cs: 180, damage: 21000, visionScore: 25 });
    expect(after.find((r) => r.matchId === "OC1_GONE")?.kills).toBe(-1);
    const detailCalls = calls.filter((u) => /\/matches\/OC1_/.test(u)).length;
    expect(detailCalls).toBe(3);
    // A third run asks for none of them again.
    calls.length = 0;
    await syncAccount(db, client, (await listAccountsForPlayer(db, player.id))[0]!);
    expect(calls.filter((u) => /\/matches\/OC1_/.test(u))).toHaveLength(0);
  });
});
