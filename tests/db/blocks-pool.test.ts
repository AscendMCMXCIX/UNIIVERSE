import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";
import { createPlayer, getOrCreateTeam, getPlayer, updatePlayer } from "@/server/repositories/team";
import { addGame, finishBlock, getActiveBlock, getRankedProfile, listBlocks, startBlock, updateRankedProfile } from "@/server/ranked/repository";
import { loadJournalLookups } from "@/server/ranked/page-data";
import { FixtureStaticProvider } from "@/server/riot/static/fixture";
import { syncStaticData } from "@/server/riot/static/sync";

/*
  Solo Queue Blocks and the player's main champion pool: the pickers offer the Primary Role pool
  first, in the player's order, read fresh each visit; until the player chooses, the focus shows the
  pool's champions in order (nothing is saved on their behalf) and follows a changed pool at once;
  games on champions outside the pool are still logged; a pool change never rewrites a finished
  block, and an active block keeps a featured champion the player chose.
*/

let handle: DbHandle;
let teamId: string;
let playerId: string;

beforeAll(async () => {
  handle = await testDb();
  await syncStaticData(handle.db, new FixtureStaticProvider(), { fingerprint: false });
  teamId = (await getOrCreateTeam(handle.db)).id;
  playerId = (await createPlayer(handle.db, teamId, { displayName: "Topper", primaryRole: "TOP", primaryPool: ["Riven", "Gwen", "Jax"] })).id;
}, 60_000);
afterAll(async () => {
  await handle.close();
});

describe("blocks and the main champion pool", () => {
  it("offers the Primary Role pool in the player's order and follows it until the player chooses", async () => {
    const lookups = await loadJournalLookups(handle.db, teamId, playerId, []);
    expect(lookups.mainPool).toEqual({ roleLabel: "Top", ids: ["Riven", "Gwen", "Jax"] });
    // No featured champion is saved on the player's behalf: the focus follows the pool.
    expect((await getRankedProfile(handle.db, playerId)).champion1).toBeNull();
    const block = await startBlock(handle.db, playerId);
    expect(block).toMatchObject({ games: 0, featuredChampionId: "Riven" });
    // The pool is reordered: the block in progress shows its new first champion at once.
    const current = (await getPlayer(handle.db, playerId))!;
    await updatePlayer(handle.db, playerId, { displayName: current.displayName, primaryRole: "TOP", primaryPool: ["Gwen", "Riven", "Jax"] });
    expect((await getActiveBlock(handle.db, playerId))!.featuredChampionId).toBe("Gwen");
    expect((await getRankedProfile(handle.db, playerId)).champion1).toBeNull();
  });

  it("keeps out-of-pool games loggable, and a chosen featured champion on the active block", async () => {
    await updateRankedProfile(handle.db, playerId, { champion1: "Gwen" });
    expect((await getActiveBlock(handle.db, playerId))!.featuredChampionId).toBe("Gwen");
    const { game } = await addGame(handle.db, playerId, { championId: "Zed", result: "win" });
    expect(game.championId).toBe("Zed");
    // The player reorders their pool: the pickers follow at once, the active block keeps Gwen.
    const current = (await getPlayer(handle.db, playerId))!;
    await updatePlayer(handle.db, playerId, { displayName: current.displayName, primaryRole: "TOP", primaryPool: ["Jax", "Riven"] });
    expect((await loadJournalLookups(handle.db, teamId, playerId, [])).mainPool.ids).toEqual(["Jax", "Riven"]);
    expect((await getActiveBlock(handle.db, playerId))!.featuredChampionId).toBe("Gwen");
  });

  it("never rewrites a finished block when the pool or role changes", async () => {
    const active = (await getActiveBlock(handle.db, playerId))!;
    await finishBlock(handle.db, playerId, active.id);
    const current = (await getPlayer(handle.db, playerId))!;
    await updatePlayer(handle.db, playerId, { displayName: current.displayName, primaryRole: "MID", primaryPool: ["Ahri"] });
    const [done] = await listBlocks(handle.db, playerId);
    expect(done).toMatchObject({ status: "completed", featuredChampionId: "Gwen", games: 1 });
    expect((await loadJournalLookups(handle.db, teamId, playerId, [])).mainPool).toEqual({ roleLabel: "Mid", ids: ["Ahri"] });
    // A new block starts at 0 games, with no target.
    expect(await startBlock(handle.db, playerId)).toMatchObject({ games: 0, plannedGames: null });
  });

  it("a block that followed the pool keeps the champion it was played with once finished", async () => {
    // Back to following the pool (the player's "Use my pool order").
    await updateRankedProfile(handle.db, playerId, { champion1: null, champion2: null, champion3: null });
    const active = (await getActiveBlock(handle.db, playerId))!;
    expect(active.featuredChampionId).toBe("Ahri");
    await addGame(handle.db, playerId, { championId: "Ahri", result: "loss" });
    await finishBlock(handle.db, playerId, active.id);
    const current = (await getPlayer(handle.db, playerId))!;
    await updatePlayer(handle.db, playerId, { displayName: current.displayName, primaryRole: "MID", primaryPool: ["Syndra", "Ahri"] });
    const [done] = await listBlocks(handle.db, playerId);
    expect(done).toMatchObject({ id: active.id, status: "completed", featuredChampionId: "Ahri" });
    // A slot cleared on purpose stays empty instead of filling from the pool.
    await updateRankedProfile(handle.db, playerId, { champion1: "" });
    expect((await startBlock(handle.db, playerId)).featuredChampionId).toBeNull();
  });
});
