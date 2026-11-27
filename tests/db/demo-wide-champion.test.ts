import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";
import { players } from "@/server/db/schema";
import { FixtureStaticProvider } from "@/server/riot/static/fixture";
import { syncStaticData } from "@/server/riot/static/sync";
import { applyWideChampionFixture, roundRobin, seedDemoAccounts, seedDemoRoster } from "@/server/demo/seed";
import { getPlayer } from "@/server/repositories/team";
import { getPlayerOverview } from "@/server/players/overview";
import { getChampionPreview, getPairingGames } from "@/server/players/champion-preview";
import { arrangeOpponents, smallSample } from "@/domain/champion-preview";
import { demoWideChampion } from "@/server/bootstrap";

/*
  The wide-champion demo (UNIIVERSE_DEMO_WIDE_CHAMPION=1 on the in-memory demo, 27 Nov 2026;
  src/server/demo/seed.ts, applyWideChampionFixture): All Champions' one-screen workspace is checked
  against a champion with dozens of lane opponents, as production's Ambessa has, and a list longer
  than any page (e2e/all-champions-workspace.spec.ts). Demo Top gets Ambessa (Top only, 98 games, 40
  opponents: 15 ranked, 25 small samples), Aatrox in two positions (12 Top and 5 Mid opponents) and
  22 champions played a little, one game with no recorded position: 30 rows. The default demo is
  unchanged.
*/

async function demo(wide: boolean): Promise<DbHandle> {
  const handle = await testDb();
  await syncStaticData(handle.db, new FixtureStaticProvider(), { fingerprint: false });
  await seedDemoRoster(handle.db);
  await seedDemoAccounts(handle.db);
  if (wide) await applyWideChampionFixture(handle.db);
  return handle;
}

async function demoTop(handle: DbHandle) {
  const [row] = await handle.db.select({ id: players.id }).from(players).where(eq(players.displayName, "Demo Top"));
  return (await getPlayer(handle.db, row!.id))!;
}

const scope = (champion: string, role: "TOP" | "MID") => ({ season: "all" as const, mode: "all" as const, account: "all", champion, role });

describe("the wide-champion demo", () => {
  let base: DbHandle;
  let wide: DbHandle;
  beforeAll(async () => {
    base = await demo(false);
    wide = await demo(true);
  }, 360_000);
  afterAll(async () => {
    await base?.close();
    await wide?.close();
  });

  it("gives Demo Top 30 champions, Ambessa first with 98 Top games, its mastery and its place in the pool; the default demo keeps six", async () => {
    const before = await getPlayerOverview(base.db, await demoTop(base), { mode: "all", riotConfigured: true });
    expect(before.topChampions).toHaveLength(6);
    expect(before.topChampions.some((c) => c.championId === "Ambessa")).toBe(false);
    const after = await getPlayerOverview(wide.db, await demoTop(wide), { mode: "all", riotConfigured: true });
    expect(after.topChampions).toHaveLength(30);
    const ambessa = after.topChampions.find((c) => c.championId === "Ambessa")!;
    expect(ambessa.selected.games).toBe(98);
    expect(ambessa.roles.map((r) => r.role)).toEqual(["TOP"]);
    expect(ambessa.mastery?.points).toBe(405_000);
    expect(ambessa.poolRoles).toContain("TOP");
    // Aatrox in two positions; one champion with a game that records none.
    const aatrox = after.topChampions.find((c) => c.championId === "Aatrox")!;
    expect(aatrox.roles.map((r) => [r.role, r.games])).toEqual([["TOP", 20], ["MID", 8]]);
    expect(after.topChampions.filter((c) => c.noRole > 0).map((c) => [c.championId, c.noRole])).toEqual([["Kayn", 1]]);
    // Every position has a champion.
    expect(new Set(after.topChampions.flatMap((c) => c.roles.map((r) => r.role)))).toEqual(new Set(["TOP", "JUNGLE", "MID", "ADC", "SUPPORT"]));
  });

  it("gives Ambessa 40 lane opponents, 15 ranked and 25 small samples, every game naming one; Darius the most met with 9", async () => {
    const p = await demoTop(wide);
    const tally = await getChampionPreview(wide.db, p.id, scope("Ambessa", "TOP"));
    expect(tally.games).toBe(98);
    expect(tally.known).toBe(98);
    expect(tally.opponents).toHaveLength(40);
    expect(tally.opponents.filter((o) => !smallSample(o))).toHaveLength(15);
    const ordered = arrangeOpponents(tally.opponents, "games").rows;
    expect(ordered[0]).toMatchObject({ championId: "Darius", games: 9 });
    expect(arrangeOpponents(tally.opponents, "high").divider).toBe(15);
    const darius = await getPairingGames(wide.db, p.id, scope("Ambessa", "TOP"), "Darius");
    expect(darius.games).toHaveLength(9);
    // Most of Darius's games have a timeline (the 10:00 sentence), and at least one has none.
    expect(darius.games.filter((g) => g.timeline === "frames").length).toBeGreaterThanOrEqual(5);
    expect(darius.games.some((g) => g.timeline !== "frames")).toBe(true);
    expect(darius.ten?.games ?? 0).toBeGreaterThanOrEqual(5);
  });

  it("gives Aatrox 12 Top and 5 Mid opponents", async () => {
    const p = await demoTop(wide);
    expect((await getChampionPreview(wide.db, p.id, scope("Aatrox", "TOP"))).opponents).toHaveLength(12);
    expect((await getChampionPreview(wide.db, p.id, scope("Aatrox", "MID"))).opponents).toHaveLength(5);
  });

  it("is decided by bootstrap for the in-memory demo alone", () => {
    expect(demoWideChampion("pglite-memory", { UNIIVERSE_DEMO_WIDE_CHAMPION: "1" })).toBe(true);
    expect(demoWideChampion("pglite-file", { UNIIVERSE_DEMO_WIDE_CHAMPION: "1" })).toBe(false);
    expect(demoWideChampion("postgres", { UNIIVERSE_DEMO_WIDE_CHAMPION: "1" })).toBe(false);
    expect(demoWideChampion("pglite-memory", {})).toBe(false);
  });

  it("is idempotent: run again, it adds no game", async () => {
    expect(await applyWideChampionFixture(wide.db)).toEqual({ created: 0 });
  });

  it("interleaves a schedule round-robin, so every opponent's games spread over the season", () => {
    expect(roundRobin([["A", 3], ["B", 1], ["C", 2]])).toEqual(["A", "B", "C", "A", "C", "A"]);
  });
});
