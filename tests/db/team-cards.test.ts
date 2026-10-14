import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";
import { accountChampionHistory, accountMatches, patches, playerTags } from "@/server/db/schema";
import { patchSortKey } from "@/domain/patch";
import { FixtureStaticProvider } from "@/server/riot/static/fixture";
import { syncStaticData } from "@/server/riot/static/sync";
import { createPlayer, getOrCreateTeam, patchPlayerProfile, setCardStyle, setLineupSlot } from "@/server/repositories/team";
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
  it("gives every filled slot the same structure: featured art, tags, season figures and the full role pool", async () => {
    const roster = await getTeamRoster(handle.db, teamId);
    const topSlot = roster.slots.find((s) => s.role === "TOP")!;
    const p = topSlot.player!;
    expect(p.art).toEqual({ championId: "Riven", skinNum: 0 });
    expect(p.cardAccent).toBe("default");
    // Proven Fighter experience → playstyle tags; 4 games is far too few for performance tags.
    expect(p.tags.map((t) => t.label)).toContain("Proven Fighter");
    expect(p.tags.some((t) => t.kind === "performance")).toBe(false);
    expect(p.tags.length).toBeLessThanOrEqual(3);
    expect(p.season).toMatchObject({ games: 4, winRate: 0.5 });
    // All ten champions are on the card (it scrolls inside a fixed area); nothing is cut off.
    expect(topSlot.champions).toHaveLength(10);
    // No proven experience yet: a neutral description, never an invented strength.
    const jg = roster.slots.find((s) => s.role === "JUNGLE")!.player!;
    expect(jg.tags.every((t) => t.kind === "neutral")).toBe(true);
  });

  it("caches tags and recomputes them only when the evidence changes", async () => {
    const [before] = await handle.db.select().from(playerTags).where(eq(playerTags.playerId, top));
    expect(before?.tags.length).toBeGreaterThan(0);
    await getTeamRoster(handle.db, teamId);
    const [same] = await handle.db.select().from(playerTags).where(eq(playerTags.playerId, top));
    expect(same!.computedAt.getTime()).toBe(before!.computedAt.getTime());
    // Pools change → new fingerprint → recomputed.
    await patchPlayerProfile(handle.db, top, { primaryPool: ["Gwen", "Riven"] });
    await getTeamRoster(handle.db, teamId);
    const [after] = await handle.db.select().from(playerTags).where(eq(playerTags.playerId, top));
    expect(after!.inputsHash).not.toBe(before!.inputsHash);
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
    expect(reset.art).toEqual({ championId: "Gwen", skinNum: 0 });
  });
});
