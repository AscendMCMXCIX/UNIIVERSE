import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";
import { accountMatches, rankedBlocks } from "@/server/db/schema";
import { FixtureStaticProvider } from "@/server/riot/static/fixture";
import { syncStaticData } from "@/server/riot/static/sync";
import { createPlayer, getOrCreateTeam } from "@/server/repositories/team";
import { addAccount } from "@/server/accounts/repository";
import { addGame, finishBlock, getActiveBlock, getBlock, importMatch, listBlocks, listGames, setBlockSize, setPlayedWith, startBlock, updateRankedProfile } from "@/server/ranked/repository";

/* Solo Queue Blocks: sizes chosen by the player, early finishes, the focus each block was played with, and who a game was played with. */

let handle: DbHandle;
let dana: string;
let eli: string;
let fay: string;
let gus: string;

beforeAll(async () => {
  handle = await testDb();
  await syncStaticData(handle.db, new FixtureStaticProvider(), { fingerprint: false });
  const team = await getOrCreateTeam(handle.db);
  const mk = async (name: string) => (await createPlayer(handle.db, team.id, { displayName: name, primaryRole: "MID", primaryPool: ["Ahri"] })).id;
  dana = await mk("Dana");
  eli = await mk("Eli");
  fay = await mk("Fay");
  gus = await mk("Gus");
}, 60_000);
afterAll(async () => {
  await handle.close();
});

describe("block sizes", () => {
  it("never assumes a size: starting a block, or logging into none, asks for one", async () => {
    await expect(startBlock(handle.db, gus)).rejects.toThrow(/how many games/);
    await expect(startBlock(handle.db, gus, 0)).rejects.toThrow(/how many games/);
    await expect(startBlock(handle.db, gus, 21)).rejects.toThrow(/how many games/);
    await expect(addGame(handle.db, gus, { championId: "Ahri", result: "win" })).rejects.toThrow(/how many games/);
    expect(await getActiveBlock(handle.db, gus)).toBeNull();
  });

  it("completes a block at the size chosen, then the next block has its own size", async () => {
    const db = handle.db;
    const block = await startBlock(db, gus, 3);
    expect(block).toMatchObject({ plannedGames: 3, state: "active", games: 0 });
    const results = [];
    for (const r of ["win", "loss", "win"] as const) results.push((await addGame(db, gus, { championId: "Ahri", result: r })).blockCompleted);
    expect(results).toEqual([false, false, true]);
    const [done] = await listBlocks(db, gus);
    expect(done).toMatchObject({ plannedGames: 3, games: 3, state: "completed" });
    const next = await startBlock(db, gus, 10);
    expect(next).toMatchObject({ number: 2, plannedGames: 10 });
  });

  it("finishes early and says so: planned, logged and completed early stay distinct", async () => {
    const db = handle.db;
    const active = (await getActiveBlock(db, gus))!;
    await addGame(db, gus, { championId: "Ahri", result: "loss" });
    await addGame(db, gus, { championId: "Ahri", result: "win" });
    const finished = await finishBlock(db, gus, active.id);
    expect(finished).toMatchObject({ plannedGames: 10, games: 2, status: "completed", state: "completed-early" });
  });

  it("changes the size of the block in progress, never below what is logged; equal finishes it", async () => {
    const db = handle.db;
    const block = await startBlock(db, gus, 5);
    await addGame(db, gus, { championId: "Ahri", result: "win" });
    await addGame(db, gus, { championId: "Ahri", result: "win" });
    await expect(setBlockSize(db, gus, block.id, 1)).rejects.toThrow(/already has 2 games/);
    expect(await setBlockSize(db, gus, block.id, 8)).toMatchObject({ plannedGames: 8, state: "active" });
    expect(await setBlockSize(db, gus, block.id, 2)).toMatchObject({ plannedGames: 2, state: "completed" });
    await expect(setBlockSize(db, gus, block.id, 4)).rejects.toThrow(/in progress/);
    // Another player cannot resize it.
    await expect(setBlockSize(db, dana, block.id, 4)).rejects.toThrow(/not found/);
  });

  it("reads blocks from before sizes were chosen as six-game blocks", async () => {
    const db = handle.db;
    const [legacy] = await db.insert(rankedBlocks).values({ playerId: fay, number: 1, status: "completed", completedAt: new Date() }).returning();
    expect(legacy!.plannedGames).toBeNull();
    const [view] = await listBlocks(db, fay);
    expect(view).toMatchObject({ plannedGames: 6, focus: null });
    await db.delete(rankedBlocks).where(eq(rankedBlocks.id, legacy!.id));
  });
});

describe("ranked focus history", () => {
  it("keeps the focus a block was played with; the block in progress follows changes", async () => {
    const db = handle.db;
    await updateRankedProfile(db, dana, { focus: "Ward before the second back." });
    const first = await startBlock(db, dana, 2);
    expect(first.focus).toBe("Ward before the second back.");
    await updateRankedProfile(db, dana, { focus: "Track the enemy jungler." });
    expect((await getActiveBlock(db, dana))!.focus).toBe("Track the enemy jungler.");
    await addGame(db, dana, { championId: "Ahri", result: "win" });
    await addGame(db, dana, { championId: "Ahri", result: "loss" });
    await updateRankedProfile(db, dana, { focus: "Trade around cooldowns." });
    const finished = (await getBlock(db, dana, first.id))!.block;
    expect(finished).toMatchObject({ state: "completed", focus: "Track the enemy jungler." });
  });
});

describe("played with", () => {
  let danaAcc: string;
  beforeAll(async () => {
    const db = handle.db;
    danaAcc = (await addAccount(db, { ownerType: "player", playerId: dana, riotId: "Dana#OCE", platform: "oc1" })).id;
    const eliAcc = (await addAccount(db, { ownerType: "player", playerId: eli, riotId: "Eli#OCE", platform: "oc1" })).id;
    const fayAcc = (await addAccount(db, { ownerType: "player", playerId: fay, riotId: "Fay#OCE", platform: "oc1" })).id;
    const base = { gameCreation: Date.parse("2026-10-12T10:00:00Z"), queueId: 420, patch: "26.20", gameDuration: 1800 };
    await db.insert(accountMatches).values([
      // Dana and Eli on the winning side; Fay on the losing side of the same match.
      { ...base, accountId: danaAcc, matchId: "OC1_77", championId: "Ahri", role: "MID", win: true },
      { ...base, accountId: eliAcc, matchId: "OC1_77", championId: "Vi", role: "JUNGLE", win: true },
      { ...base, accountId: fayAcc, matchId: "OC1_77", championId: "Zed", role: "MID", win: false },
      { ...base, accountId: danaAcc, matchId: "OC1_78", championId: "Ahri", role: "MID", win: false, gameCreation: base.gameCreation + 3_600_000 },
    ]);
  });

  it("detects registered teammates on the same side of the same match, never an enemy", async () => {
    const db = handle.db;
    const { game } = await importMatch(db, dana, "OC1_77", { plannedGames: 4 });
    expect(game.playedWith).toEqual([{ playerId: eli, source: "detected" }]);
    const { game: alone } = await importMatch(db, dana, "OC1_78");
    expect(alone.playedWith).toEqual([]);
  });

  it("lets the owner correct it, and the correction sticks", async () => {
    const db = handle.db;
    const [game] = (await listGames(db, dana)).filter((g) => g.riotMatchId === "OC1_77");
    const removed = await setPlayedWith(db, dana, game!.id, eli, false);
    expect(removed.playedWith).toEqual([]);
    expect(removed.notPlayedWith).toEqual([eli]);
    const block = (await getActiveBlock(db, dana))!;
    expect((await getBlock(db, dana, block.id))!.games.find((g) => g.id === game!.id)!.playedWith).toEqual([]);
    const back = await setPlayedWith(db, dana, game!.id, eli, true);
    expect(back.playedWith).toEqual([{ playerId: eli, source: "detected" }]);
    // A teammate who was not detected can be added by hand.
    const tagged = await setPlayedWith(db, dana, game!.id, gus, true);
    expect(tagged.playedWith).toEqual([{ playerId: eli, source: "detected" }, { playerId: gus, source: "tagged" }]);
  });

  it("keeps the journal private: teammates see nothing, and nobody else can correct a game", async () => {
    const db = handle.db;
    const [game] = (await listGames(db, dana)).filter((g) => g.riotMatchId === "OC1_77");
    expect(await listGames(db, eli)).toEqual([]);
    await expect(setPlayedWith(db, eli, game!.id, dana, true)).rejects.toThrow(/not found/);
    await expect(setPlayedWith(db, dana, game!.id, dana, true)).rejects.toThrow(/yourself/);
  });
});
