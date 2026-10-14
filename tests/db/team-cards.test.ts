import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";
import { accountChampionHistory, accountMatches, patches } from "@/server/db/schema";
import { patchSortKey } from "@/domain/patch";
import { FixtureStaticProvider } from "@/server/riot/static/fixture";
import { syncStaticData } from "@/server/riot/static/sync";
import { createPlayer, getOrCreateTeam, setCardStyle, setLineupSlot } from "@/server/repositories/team";
import { addAccount } from "@/server/accounts/repository";
import { getTeamRoster } from "@/server/team/roster";
import { invalidateProficiencyCache } from "@/server/proficiency/service";

let handle: DbHandle;
let teamId: string;
let top: string;

beforeAll(async () => {
  handle = await testDb();
  await syncStaticData(handle.db, new FixtureStaticProvider(), { fingerprint: false });
  const db = handle.db;
  teamId = (await getOrCreateTeam(db)).id;
  const big = ["Riven", "Gwen", "Ambessa", "Jax", "Fiora", "Camille", "Darius", "Aatrox", "Garen", "Irelia"];
  top = (await createPlayer(db, teamId, { displayName: "Fighter", primaryRole: "TOP", primaryPool: big })).id;
  const jg = (await createPlayer(db, teamId, { displayName: "Newbie", primaryRole: "JUNGLE", primaryPool: ["Viego"] })).id;
  await setLineupSlot(db, teamId, "TOP", top);
  await setLineupSlot(db, teamId, "JUNGLE", jg);
  await db.update(patches).set({ isCurrent: false });
  await db.insert(patches).values({ id: "16.20", ddragonVersion: "16.20.1", isCurrent: true, sortKey: patchSortKey("16.20") });
  const account = await addAccount(db, { ownerType: "player", playerId: top, riotId: "Fighter#OCE", platform: "oc1" });
  const recent = new Date(Date.now() - 2 * 86_400_000);
  await db.insert(accountChampionHistory).values([
    { accountId: account.id, championId: "Riven", role: "TOP", queueGroup: "solo", patch: "16.20", games: 140, wins: 80, lastPlayedAt: recent },
    { accountId: account.id, championId: "Gwen", role: "TOP", queueGroup: "solo", patch: "16.20", games: 60, wins: 33, lastPlayedAt: recent },
  ]);
  await db.insert(accountMatches).values(Array.from({ length: 4 }, (_, i) => ({ accountId: account.id, matchId: `OC1_T${i}`, gameCreation: Date.now() - i * 3_600_000, queueId: 420, championId: "Riven", role: "TOP", win: i % 2 === 0, patch: "16.20", kills: 5, deaths: 2, assists: 5, cs: 200, damage: 20000, visionScore: 20, gameDuration: 1800 })));
  invalidateProficiencyCache();
});
afterAll(async () => {
  await handle.close();
});

describe("Team player cards", () => {
  it("gives every filled slot the same structure: featured art, season figures and every champion of the role pool with its own figures", async () => {
    const roster = await getTeamRoster(handle.db, teamId);
    const topSlot = roster.slots.find((s) => s.role === "TOP")!;
    const p = topSlot.player!;
    expect(p.art).toEqual({ championId: "Riven", skinNum: 0 });
    expect(p.cardAccent).toBe("default");
    // No generated tags any more: the card is the player's real champions and results.
    expect("tags" in p).toBe(false);
    expect(p.season).toMatchObject({ games: 4, winRate: 0.5 });
    // CS/min: total CS ÷ total minutes (4 × 200 CS over 4 × 30 min), never an average of averages.
    expect(p.season!.csPerMinute).toBeCloseTo(800 / 120, 5);
    // All ten champions are on the card, in the player's order; nothing is cut off.
    expect(topSlot.champions).toHaveLength(10);
    expect(topSlot.champions.map((c) => c.championId).slice(0, 2)).toEqual(["Riven", "Gwen"]);
    // Each carries its games, record and proficiency in the role (a label and its reasons).
    const riven = topSlot.champions[0]!;
    expect(riven.games).toBeGreaterThan(0);
    expect(riven.tierLabel).not.toBe("");
    expect(riven.tierWhy.length).toBeGreaterThan(0);
    expect(["high", "medium", "low", "none"]).toContain(riven.evidence);
    expect(riven.csPerMinute).toBeCloseTo(800 / 120, 5);
    expect(riven.kdaRatio).toBeCloseTo((20 + 20) / 8, 5);
    const unplayed = topSlot.champions.find((c) => c.games === 0)!;
    expect(unplayed.winRate).toBeNull();
    // No games, no figure: CS/min stays empty rather than 0.
    expect(unplayed.csPerMinute).toBeNull();
  });

  it("shows the role a player holds in the lineup, and changes with it", async () => {
    // The top laner moved to Jungle: their Top champions and games do not follow them there.
    await setLineupSlot(handle.db, teamId, "JUNGLE", top);
    const roster = await getTeamRoster(handle.db, teamId);
    const jungle = roster.slots.find((s) => s.role === "JUNGLE")!;
    expect(jungle.player!.id).toBe(top);
    // No Jungle games: the card's figures are for the Jungle, not their Top games.
    expect(jungle.player!.season).toBeNull();
    expect(jungle.champions).toEqual([]);
    // Back to Top: the Top pool and figures return.
    await setLineupSlot(handle.db, teamId, "TOP", top);
    const back = (await getTeamRoster(handle.db, teamId)).slots.find((s) => s.role === "TOP")!;
    expect(back.champions.map((c) => c.championId)).toContain("Riven");
    expect(back.player!.season?.games).toBe(4);
  });

  it("uses the player's chosen champion, skin and accent: one setting for every card", async () => {
    await setCardStyle(handle.db, top, { featuredChampionId: "Gwen", featuredSkinNum: 11, cardAccent: "gold" });
    const roster = await getTeamRoster(handle.db, teamId);
    const p = roster.slots.find((s) => s.role === "TOP")!.player!;
    expect(p.art).toEqual({ championId: "Gwen", skinNum: 11 });
    expect(p.cardAccent).toBe("gold");
    // Any champion may be featured, in a pool or not; clearing the champion clears the skin too.
    await setCardStyle(handle.db, top, { featuredChampionId: "Zed", featuredSkinNum: 0, cardAccent: null });
    const again = (await getTeamRoster(handle.db, teamId)).slots.find((s) => s.role === "TOP")!.player!;
    expect(again.art).toEqual({ championId: "Zed", skinNum: 0 });
    expect(again.cardAccent).toBe("default");
    await setCardStyle(handle.db, top, { featuredChampionId: null, featuredSkinNum: 4, cardAccent: null });
    const reset = (await getTeamRoster(handle.db, teamId)).slots.find((s) => s.role === "TOP")!.player!;
    // Back to the first champion of their primary pool.
    expect(reset.art).toEqual({ championId: "Riven", skinNum: 0 });
  });
});
