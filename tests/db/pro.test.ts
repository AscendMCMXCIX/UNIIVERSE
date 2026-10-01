import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";
import { proGames, proGamePicks } from "@/server/db/schema";
import { FixtureStaticProvider } from "@/server/riot/static/fixture";
import { syncStaticData } from "@/server/riot/static/sync";
import { buildResolver, LeaguepediaProvider, parseOraclesElixirCsv, storeProGames } from "@/server/pro";
import { aggregateProGames } from "@/server/ingestion/aggregate";
import { loadStatsProvider } from "@/server/stats/loader";
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
    const row = (champion: string, role: string, side: number) => ({
      title: { GameId: "2025 LEC Summer_Week 1_1_1", Tournament: "LEC 2025 Summer", League: "LEC", DateTimeUTC: "2025-06-02 16:00:00", Patch: "15.11", Team1: "T1", Team2: "T2", Winner: "2", Team1Bans: "Darius,Jinx,Zed,Yone", Team2Bans: "Ahri,Kalista,Thresh,Sylas", Team1Picks: "Gwen,Viego,Orianna,Jinx,Lulu", Team2Picks: "Nautilus,Wukong,Azir,Camille,Kai'Sa", Champion: champion, Role: role, Side: side, PlayerTeam: side === 1 ? "T1" : "T2" },
    });
    const payload = { cargoquery: [row("Gwen", "Top", 1), row("Viego", "Jungle", 1), row("Orianna", "Mid", 1), row("Jinx", "Bot", 1), row("Lulu", "Support", 1), row("Camille", "Top", 2), row("Wukong", "Jungle", 2), row("Azir", "Mid", 2), row("Kai'Sa", "Bot", 2), row("Nautilus", "Support", 2)] };
    const provider = new LeaguepediaProvider({ fetchImpl: async () => new Response(JSON.stringify(payload), { status: 200 }) });
    const result = await provider.fetchGames({ since: null, limit: 10, resolver, log: () => {} });
    expect(result.games).toHaveLength(1);
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
    const stats = await loadStatsProvider(handle.db);
    expect(stats.presence("Darius").proPresence).toBeGreaterThan(0);

    // Draft-slot statistics were folded in and surface through the provider and the patterns view.
    const slots = await handle.db.select().from(proPickSlotStats);
    expect(slots.find((r) => r.championId === "Gwen" && r.slot === "B1")?.games).toBe(1);
    expect(slots.find((r) => r.championId === "Kaisa" && r.slot === "R5")?.games).toBe(1);
    expect(slots.find((r) => r.championId === "Zed" && r.slot === "BAN1")?.games).toBe(1);
    expect(slots.find((r) => r.championId === "Yone" && r.slot === "BAN2")?.games).toBe(1);
    expect(stats.proSlots("Gwen")?.firstRotation).toBe(1);
    expect(stats.proSlots("Kaisa")?.counterpick).toBe(1);
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
});
