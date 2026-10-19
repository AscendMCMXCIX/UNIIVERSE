import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";
import { proGames, proGamePicks } from "@/server/db/schema";
import { FixtureStaticProvider } from "@/server/riot/static/fixture";
import { syncStaticData } from "@/server/riot/static/sync";
import { buildResolver, LeaguepediaProvider, parseOraclesElixirCsv, storeProGames } from "@/server/pro";
import { interpretCargoResponse } from "@/server/pro/leaguepedia";
import { aggregateProGames } from "@/server/ingestion/aggregate";
import { invalidateStatsCache } from "@/server/stats/loader";
import { describeStatsCheap } from "@/server/stats/describe";
import { loadProDraftPatterns } from "@/server/pro/patterns";
import { proPickSlotStats } from "@/server/db/schema";

let handle: DbHandle;
beforeAll(async () => {
  handle = await testDb();
  await syncStaticData(handle.db, new FixtureStaticProvider(), { fingerprint: false });
});
afterAll(async () => {
  await handle.close();
});

const OE_CSV = `gameid,league,date,patch,side,position,playername,teamname,champion,ban1,ban2,ban3,ban4,ban5,result,pick
G1,LEC,2025-06-01 15:00:00,15.11,Blue,top,A,Blue Team,Gwen,Darius,Jinx,,,,1,1
G1,LEC,2025-06-01 15:00:00,15.11,Blue,jng,B,Blue Team,Viego,Darius,Jinx,,,,1,2
G1,LEC,2025-06-01 15:00:00,15.11,Blue,mid,C,Blue Team,Orianna,Darius,Jinx,,,,1,3
G1,LEC,2025-06-01 15:00:00,15.11,Blue,bot,D,Blue Team,Jinx,Darius,Jinx,,,,1,4
G1,LEC,2025-06-01 15:00:00,15.11,Blue,sup,E,Blue Team,Lulu,Darius,Jinx,,,,1,5
G1,LEC,2025-06-01 15:00:00,15.11,Blue,team,,Blue Team,,Darius,Jinx,,,,1,
G1,LEC,2025-06-01 15:00:00,15.11,Red,top,F,Red Team,Camille,Ahri,Lee Sin,,,,0,1
G1,LEC,2025-06-01 15:00:00,15.11,Red,jng,G,Red Team,Wukong,Ahri,Lee Sin,,,,0,2
G1,LEC,2025-06-01 15:00:00,15.11,Red,mid,H,Red Team,Azir,Ahri,Lee Sin,,,,0,3
G1,LEC,2025-06-01 15:00:00,15.11,Red,bot,I,Red Team,"Kai'Sa",Ahri,Lee Sin,,,,0,4
G1,LEC,2025-06-01 15:00:00,15.11,Red,sup,J,Red Team,Nautilus,Ahri,Lee Sin,,,,0,5
G1,LEC,2025-06-01 15:00:00,15.11,Red,team,,Red Team,,Ahri,Lee Sin,,,,0,
`;

const lpRow = (champion: string, role: string, side: number) => ({
  title: { GameId: "2025 LEC Summer_Week 1_1_1", Tournament: "LEC 2025 Summer", League: "LEC", DateTimeUTC: "2025-06-02 16:00:00", Patch: "15.11", Team1: "T1", Team2: "T2", Winner: "2", Team1Bans: "Darius,Jinx,Zed,Yone", Team2Bans: "Ahri,Kalista,Thresh,Sylas", Team1Picks: "Gwen,Viego,Orianna,Jinx,Lulu", Team2Picks: "Nautilus,Wukong,Azir,Camille,Kai'Sa", Champion: champion, Role: role, Side: side, PlayerTeam: side === 1 ? "T1" : "T2" },
});
const LP_PAYLOAD = { cargoquery: [lpRow("Gwen", "Top", 1), lpRow("Viego", "Jungle", 1), lpRow("Orianna", "Mid", 1), lpRow("Jinx", "Bot", 1), lpRow("Lulu", "Support", 1), lpRow("Camille", "Top", 2), lpRow("Wukong", "Jungle", 2), lpRow("Azir", "Mid", 2), lpRow("Kai'Sa", "Bot", 2), lpRow("Nautilus", "Support", 2)] };

describe("professional data", () => {
  it("parses an Oracle's Elixir CSV into normalised games", async () => {
    const resolver = await buildResolver(handle.db);
    const { games, rejected } = parseOraclesElixirCsv(OE_CSV, { since: null, limit: 100, resolver, log: () => {} });
    expect(rejected).toBe(0);
    expect(games).toHaveLength(1);
    const g = games[0]!;
    expect(g.patch).toBe("15.11");
    expect(g.winnerSide).toBe("blue");
    expect(g.picks.find((p) => p.side === "red" && p.role === "JUNGLE")?.championId).toBe("MonkeyKing");
    expect(g.picks.find((p) => p.side === "red" && p.role === "ADC")?.championId).toBe("Kaisa");
    expect(g.bans.filter((b) => b.side === "red").map((b) => b.championId)).toEqual(["Ahri", "LeeSin"]);
  });

  it("parses Leaguepedia cargo rows and stores games idempotently", async () => {
    const resolver = await buildResolver(handle.db);
    const provider = new LeaguepediaProvider({ fetchImpl: async () => new Response(JSON.stringify(LP_PAYLOAD), { status: 200 }) });
    const result = await provider.fetchGames({ since: null, limit: 10, resolver, log: () => {} });
    expect(result.games).toHaveLength(1);
    expect(result.games[0]?.league).toBe("LEC");
    expect(result.games[0]?.winnerSide).toBe("red");
    expect(result.games[0]?.picks.find((p) => p.side === "red" && p.role === "JUNGLE")?.championId).toBe("MonkeyKing");
    // Pick order comes from Team1Picks/Team2Picks: Gwen was B1, Camille/Kai'Sa were red's last two.
    expect(result.games[0]?.picks.find((p) => p.championId === "Gwen")?.pickOrder).toBe(1);
    expect(result.games[0]?.picks.find((p) => p.championId === "Kaisa")?.pickOrder).toBe(5);
    expect(result.games[0]?.picks.find((p) => p.championId === "Nautilus")?.pickOrder).toBe(1);
    const inserted = await storeProGames(handle.db, result.games);
    expect(inserted).toBe(1);
    expect(await storeProGames(handle.db, result.games)).toBe(0);
    expect(await handle.db.select().from(proGames)).toHaveLength(1);
    expect(await handle.db.select().from(proGamePicks)).toHaveLength(10);

    const agg = await aggregateProGames(handle.db);
    expect(agg.games).toBe(1);
    expect((await aggregateProGames(handle.db)).games).toBe(0);
    invalidateStatsCache();
    expect((await describeStatsCheap(handle.db)).provenance?.proGames).toBeGreaterThan(0);

    // Pick-slot statistics were folded in and surface through the Pro Play patterns view.
    const slots = await handle.db.select().from(proPickSlotStats);
    expect(slots.find((r) => r.championId === "Gwen" && r.slot === "B1")?.games).toBe(1);
    expect(slots.find((r) => r.championId === "Kaisa" && r.slot === "R5")?.games).toBe(1);
    expect(slots.find((r) => r.championId === "Zed" && r.slot === "BAN1")?.games).toBe(1);
    expect(slots.find((r) => r.championId === "Yone" && r.slot === "BAN2")?.games).toBe(1);
    const patterns = await loadProDraftPatterns(handle.db);
    expect(patterns.games).toBe(1);
    expect(patterns.firstPicks[0]?.championId).toBe("Gwen");
    expect(patterns.firstRotationPairs[0]).toMatchObject({ a: "MonkeyKing", b: "Nautilus", games: 1 });
    expect(patterns.secondRotationPairs[0]).toMatchObject({ a: "Orianna", b: "Viego" });
    expect(patterns.counterpicks[0]?.championId).toBe("Kaisa");
    expect(patterns.secondPhaseBans.map((b) => b.championId).sort()).toEqual(["Sylas", "Yone"]);
  });

  it("degrades gracefully when Leaguepedia is unreachable", async () => {
    const resolver = await buildResolver(handle.db);
    const provider = new LeaguepediaProvider({ fetchImpl: async () => { throw new Error("blocked"); } });
    const result = await provider.fetchGames({ since: null, limit: 10, resolver, log: () => {} });
    expect(result.games).toHaveLength(0);
    expect(result.degraded).toMatch(/blocked/);
  });

  it("asks for the league through the Tournaments join and falls back without it when Cargo refuses", async () => {
    const resolver = await buildResolver(handle.db);
    const urls: string[] = [];
    const provider = new LeaguepediaProvider({
      fetchImpl: async (input) => {
        const url = String(input);
        urls.push(url);
        if (url.includes("Tournaments")) return new Response(JSON.stringify({ error: { code: "internal_api_error_MWException", info: "Unknown column 'T.League' in 'field list'" } }), { status: 200 });
        // Without the Tournaments join Cargo returns no League column at all.
        const withoutLeague = { cargoquery: LP_PAYLOAD.cargoquery.map(({ title: { League: _league, ...rest } }) => ({ title: rest })) };
        return new Response(JSON.stringify(withoutLeague), { status: 200 });
      },
    });
    const logs: string[] = [];
    const result = await provider.fetchGames({ since: null, limit: 10, resolver, log: (m) => logs.push(m) });
    expect(urls).toHaveLength(2);
    expect(decodeURIComponent(urls[0]!)).toContain("SG.OverviewPage=T.OverviewPage");
    expect(decodeURIComponent(urls[0]!)).not.toContain("SG.League");
    expect(decodeURIComponent(urls[1]!)).not.toContain("Tournaments");
    expect(logs[0]).toMatch(/Unknown column/);
    expect(result.degraded).toBeUndefined();
    expect(result.games).toHaveLength(1);
    expect(result.games[0]?.league).toBe("");
  });

  it("logs in with a bot password and queries as that user", async () => {
    const resolver = await buildResolver(handle.db);
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const provider = new LeaguepediaProvider({
      username: "Coach@uniiverse",
      password: "s3cret",
      fetchImpl: async (input, init) => {
        const url = String(input);
        calls.push({ url, init });
        if (url.includes("meta=tokens")) return new Response(JSON.stringify({ query: { tokens: { logintoken: "tok+\\" } } }), { status: 200, headers: { "set-cookie": "lp_session=abc; Path=/; HttpOnly" } });
        if (init?.method === "POST") return new Response(JSON.stringify({ login: { result: "Success", lgusername: "Coach" } }), { status: 200, headers: { "set-cookie": "lpUserID=42; Path=/" } });
        return new Response(JSON.stringify(LP_PAYLOAD), { status: 200 });
      },
    });
    const logs: string[] = [];
    const result = await provider.fetchGames({ since: null, limit: 10, resolver, log: (m) => logs.push(m) });
    expect(calls).toHaveLength(3);
    const loginBody = String(calls[1]!.init?.body);
    expect(loginBody).toContain("action=login");
    expect(loginBody).toContain("lgname=Coach%40uniiverse");
    expect(loginBody).toContain("lgpassword=s3cret");
    expect(loginBody).toContain("lgtoken=tok%2B%5C");
    expect((calls[1]!.init?.headers as Record<string, string>).cookie).toBe("lp_session=abc");
    expect((calls[2]!.init?.headers as Record<string, string>).cookie).toBe("lp_session=abc; lpUserID=42");
    expect(calls[2]!.url).toContain("assert=user");
    expect(logs[0]).toBe("logged in to Leaguepedia as Coach@uniiverse");
    expect(result.degraded).toBeUndefined();
    expect(result.games).toHaveLength(1);
  });

  it("reports a failed login, and explains the anonymous rate limit when no login is configured", async () => {
    const resolver = await buildResolver(handle.db);
    const failing = new LeaguepediaProvider({
      username: "Coach@uniiverse",
      password: "wrong",
      fetchImpl: async (_input, init) =>
        init?.method === "POST"
          ? new Response(JSON.stringify({ login: { result: "Failed", reason: "Incorrect username or password entered. Please try again." } }), { status: 200 })
          : new Response(JSON.stringify({ query: { tokens: { logintoken: "t" } } }), { status: 200 }),
    });
    const failed = await failing.fetchGames({ since: null, limit: 10, resolver, log: () => {} });
    expect(failed.games).toHaveLength(0);
    expect(failed.degraded).toMatch(/^Leaguepedia login failed: Incorrect username or password.*signed in as "Coach@uniiverse" with a 5-character password/);
    const noBotName = new LeaguepediaProvider({ username: "Coach", password: "x".repeat(32), fetchImpl: async () => { throw new Error("must not be called"); } });
    const rejected = await noBotName.fetchGames({ since: null, limit: 10, resolver, log: () => {} });
    expect(rejected.degraded).toMatch(/must be the full bot login name Account@BotName/);

    let requests = 0;
    const anonymous = new LeaguepediaProvider({
      username: null,
      password: null,
      fetchImpl: async () => {
        requests += 1;
        return new Response(JSON.stringify({ error: { code: "ratelimited", info: "You've exceeded your rate limit. Please wait some time and try again." } }), { status: 200 });
      },
    });
    const limited = await anonymous.fetchGames({ since: null, limit: 10, resolver, log: () => {} });
    expect(requests).toBe(1); // a rate limit is never retried
    expect(limited.degraded).toMatch(/exceeded your rate limit.*LEAGUEPEDIA_USERNAME and LEAGUEPEDIA_PASSWORD/);
  });

  it("says exactly what Leaguepedia answered when a query is refused", async () => {
    const resolver = await buildResolver(handle.db);
    const provider = new LeaguepediaProvider({ fetchImpl: async () => new Response(JSON.stringify({ error: { code: "ratelimited", info: "Too many requests" } }), { status: 200 }) });
    const result = await provider.fetchGames({ since: null, limit: 10, resolver, log: () => {} });
    expect(result.games).toHaveLength(0);
    expect(result.degraded).toBe("Leaguepedia rejected the query: Too many requests");
    expect(interpretCargoResponse({ batchcomplete: "" })).toEqual({ error: "Leaguepedia response shape changed (got batchcomplete)" });
    expect(interpretCargoResponse({ cargoquery: [] })).toEqual({ rows: [] });
  });
});
