import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";
import { championBanStats, rankedBans, rankedMatches } from "@/server/db/schema";
import { FixtureStaticProvider } from "@/server/riot/static/fixture";
import { syncStaticData } from "@/server/riot/static/sync";
import { aggregateRankedMatches } from "@/server/ingestion/aggregate";
import { EMBEDDED_MIGRATIONS } from "@/server/db/migrations.generated";
import fixture from "@/server/riot/fixtures/champions.fixture.json";

/* Ban rate counts games: a champion banned by both teams in one ranked game is one banned game. */

const keyOf = (id: string) => Number(fixture.champions.find((c) => c.id === id)!.key);
let handle: DbHandle;

const zedBans = async () => {
  const rows = await handle.db.select({ tierBand: championBanStats.tierBand, bans: championBanStats.bans }).from(championBanStats).where(and(eq(championBanStats.source, "ranked"), eq(championBanStats.championId, "Zed")));
  return Object.fromEntries(rows.map((r) => [r.tierBand, r.bans]));
};

beforeAll(async () => {
  handle = await testDb();
  await syncStaticData(handle.db, new FixtureStaticProvider(), { fingerprint: false });
  const base = { platform: "OC1", gameVersion: "16.20.1.1", patch: "16.20", queueId: 420, gameCreation: Date.now(), gameDuration: 1800, winningTeamId: 100 };
  await handle.db.insert(rankedMatches).values([
    { ...base, matchId: "OC1_1", tierBand: "EMERALD" },
    { ...base, matchId: "OC1_2", tierBand: "EMERALD" },
    { ...base, matchId: "OC1_3", tierBand: "DIAMOND" },
  ]);
  await handle.db.insert(rankedBans).values([
    // Both teams banned Zed in game 1.
    { matchId: "OC1_1", teamId: 100, pickTurn: 1, championKey: keyOf("Zed") },
    { matchId: "OC1_1", teamId: 200, pickTurn: 6, championKey: keyOf("Zed") },
    { matchId: "OC1_1", teamId: 200, pickTurn: 7, championKey: keyOf("Gwen") },
    { matchId: "OC1_2", teamId: 100, pickTurn: 1, championKey: keyOf("Zed") },
    { matchId: "OC1_3", teamId: 100, pickTurn: 2, championKey: keyOf("Zed") },
    // "No ban" (-1) is not a champion.
    { matchId: "OC1_3", teamId: 200, pickTurn: 6, championKey: -1 },
  ]);
}, 60_000);
afterAll(async () => {
  await handle.close();
});

describe("ranked ban counts", () => {
  it("count a double ban once per game, per ladder band", async () => {
    await aggregateRankedMatches(handle.db);
    expect(await zedBans()).toEqual({ EMERALD: 2, DIAMOND: 1 });
  });

  it("migration 0022 recounts stored ban totals from the matches and leaves the matches untouched", async () => {
    // Totals as the earlier aggregation would have stored them (double ban counted twice).
    await handle.db.update(championBanStats).set({ bans: 3 }).where(and(eq(championBanStats.championId, "Zed"), eq(championBanStats.tierBand, "EMERALD")));
    const before = await handle.db.select({ n: sql<number>`count(*)` }).from(rankedBans);
    const migration = EMBEDDED_MIGRATIONS.find((m) => m.tag === "0022_p7_ranked_ban_recount")!;
    await handle.db.transaction(async (tx) => {
      for (const statement of migration.statements) await tx.execute(sql.raw(statement));
    });
    expect(await zedBans()).toEqual({ EMERALD: 2, DIAMOND: 1 });
    const gwen = await handle.db.select().from(championBanStats).where(eq(championBanStats.championId, "Gwen"));
    expect(gwen.map((g) => g.bans)).toEqual([1]);
    const after = await handle.db.select({ n: sql<number>`count(*)` }).from(rankedBans);
    expect(Number(after[0]!.n)).toBe(Number(before[0]!.n));
  });
});
