import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";
import { accountMatches } from "@/server/db/schema";
import { FixtureStaticProvider } from "@/server/riot/static/fixture";
import { syncStaticData } from "@/server/riot/static/sync";
import { createPlayer, getOrCreateTeam } from "@/server/repositories/team";
import { addAccount } from "@/server/accounts/repository";
import { addGame, finishBlock, getActiveBlock, getBlock, importMatch, listGames, setBlockSize, setPlayedWith, startBlock, updateRankedProfile } from "@/server/ranked/repository";

/* Solo Queue Blocks: targets chosen (and changed) by the player, playing past them, early finishes, the focus each block was played with, and who a game was played with. */

let handle: DbHandle;
let dana: string;
let eli: string;
let fay: string;
let gus: string;
let hal: string;

beforeAll(async () => {
  handle = await testDb();
  await syncStaticData(handle.db, new FixtureStaticProvider(), { fingerprint: false });
  const team = await getOrCreateTeam(handle.db);
  const mk = async (name: string) => (await createPlayer(handle.db, team.id, { displayName: name, primaryRole: "MID", primaryPool: ["Ahri"] })).id;
  dana = await mk("Dana");
  eli = await mk("Eli");
  fay = await mk("Fay");
  gus = await mk("Gus");
  hal = await mk("Hal");
}, 60_000);
afterAll(async () => {
  await handle.close();
});

describe("block targets", () => {
  it("starts at 0 / 1 without a target, and logging a game with no block starts one", async () => {
    const db = handle.db;
    // Out-of-range targets are still refused; no target is the default.
    await expect(startBlock(db, gus, 0)).rejects.toThrow(/how many games/);
    await expect(startBlock(db, gus, 101)).rejects.toThrow(/how many games/);
    expect(await getActiveBlock(db, gus)).toBeNull();
    const { block, targetReached } = await addGame(db, gus, { championId: "Ahri", result: "win" });
    expect(block).toMatchObject({ number: 1, plannedGames: null, games: 1, state: "active" });
    expect(targetReached).toBe(false);
    await finishBlock(db, gus, block.id);
    const empty = await startBlock(db, gus);
    expect(empty).toMatchObject({ number: 2, plannedGames: null, games: 0, state: "active" });
    // Starting again returns the same block: there is never more than one in progress.
    expect((await startBlock(db, gus)).id).toBe(empty.id);
    await setBlockSize(db, gus, empty.id, 3);
  });

  it("treats the target as a plan: reaching it offers to finish, playing on keeps the block", async () => {
    const db = handle.db;
    const block = (await getActiveBlock(db, gus))!;
    expect(block).toMatchObject({ plannedGames: 3, state: "active", games: 0 });
    const reached = [];
    for (const r of ["win", "loss", "win", "win"] as const) reached.push((await addGame(db, gus, { championId: "Ahri", result: r })).targetReached);
    expect(reached).toEqual([false, false, true, true]);
    // Four games in a three-game block: still the same block, nothing lost.
    expect(await getActiveBlock(db, gus)).toMatchObject({ id: block.id, plannedGames: 3, games: 4, wins: 3, status: "active" });
    const done = await finishBlock(db, gus, block.id);
    expect(done).toMatchObject({ plannedGames: 3, games: 4, state: "completed" });
    const next = await startBlock(db, gus, 10);
    expect(next).toMatchObject({ number: 3, plannedGames: 10 });
  });

  it("finishes early and says so: planned, logged and completed early stay distinct", async () => {
    const db = handle.db;
    const active = (await getActiveBlock(db, gus))!;
    await addGame(db, gus, { championId: "Ahri", result: "loss" });
    await addGame(db, gus, { championId: "Ahri", result: "win" });
    const finished = await finishBlock(db, gus, active.id);
    expect(finished).toMatchObject({ plannedGames: 10, games: 2, status: "completed", state: "completed-early" });
  });

  it("changes the target of the block in progress freely, never removing a game", async () => {
    const db = handle.db;
    const block = await startBlock(db, gus, 5);
    await addGame(db, gus, { championId: "Ahri", result: "win", notes: "first" });
    await addGame(db, gus, { championId: "Ahri", result: "win", notes: "second" });
    // Below what is logged: allowed, the games stay, the block stays open.
    expect(await setBlockSize(db, gus, block.id, 1)).toMatchObject({ plannedGames: 1, games: 2, state: "active" });
    expect(await setBlockSize(db, gus, block.id, 8)).toMatchObject({ plannedGames: 8, state: "active" });
    // No target at all.
    expect(await setBlockSize(db, gus, block.id, "open")).toMatchObject({ plannedGames: null, state: "active" });
    const detail = await getBlock(db, gus, block.id);
    expect(detail!.games.map((g) => g.notes)).toEqual(["first", "second"]);
    // Finished without a target: simply completed, never "early".
    expect(await finishBlock(db, gus, block.id)).toMatchObject({ plannedGames: null, games: 2, state: "completed" });
    await expect(setBlockSize(db, gus, block.id, 4)).rejects.toThrow(/in progress/);
    // Another player cannot change it.
    await expect(setBlockSize(db, dana, block.id, 4)).rejects.toThrow(/not found/);
  });

  it("grows with no maximum: past 6, 12 and 18 games without a target", async () => {
    const db = handle.db;
    const block = await startBlock(db, hal);
    for (let i = 0; i < 40; i++) await addGame(db, hal, { championId: "Ahri", result: i % 2 ? "win" : "loss" });
    expect(await getActiveBlock(db, hal)).toMatchObject({ id: block.id, plannedGames: null, games: 40, wins: 20, state: "active" });
    expect(await finishBlock(db, hal, block.id)).toMatchObject({ games: 40, state: "completed" });
  }, 60_000);

  it("supports any size: 1, 3, 6, 12, 18 and more than 18, and no target", async () => {
    const db = handle.db;
    for (const size of [1, 3, 6, 12, 18, 25, "open"] as const) {
      const block = await startBlock(db, fay, size);
      const n = size === "open" ? 7 : size;
      for (let i = 0; i < n; i++) await addGame(db, fay, { championId: "Lux", result: i % 3 ? "win" : "loss", mainMistake: "mechanics", notes: `g${i}` });
      const finished = await finishBlock(db, fay, block.id);
      expect(finished).toMatchObject({ games: n, plannedGames: size === "open" ? null : size, state: "completed" });
      expect((await getBlock(db, fay, block.id))!.games).toHaveLength(n);
    }
  }, 60_000);
});

describe("ranked focus history", () => {
  it("keeps the featured champion a block was played with; editing the focus never rewrites finished blocks", async () => {
    const db = handle.db;
    await updateRankedProfile(db, fay, { champion1: "Ahri", focus: "Roam after first back." });
    const block = await startBlock(db, fay);
    expect(block).toMatchObject({ featuredChampionId: "Ahri", focus: "Roam after first back." });
    await updateRankedProfile(db, fay, { champion1: "Lux" });
    expect((await getActiveBlock(db, fay))!.featuredChampionId).toBe("Lux");
    await addGame(db, fay, { championId: "Lux", result: "win" });
    await finishBlock(db, fay, block.id);
    await updateRankedProfile(db, fay, { champion1: "Ahri", focus: "Something else." });
    expect((await getBlock(db, fay, block.id))!.block).toMatchObject({ featuredChampionId: "Lux", focus: "Roam after first back." });
  });

  it("keeps the focus a block was played with; the block in progress follows changes", async () => {
    const db = handle.db;
    await updateRankedProfile(db, dana, { focus: "Ward before the second back." });
    const first = await startBlock(db, dana, 2);
    expect(first.focus).toBe("Ward before the second back.");
    await updateRankedProfile(db, dana, { focus: "Track the enemy jungler." });
    expect((await getActiveBlock(db, dana))!.focus).toBe("Track the enemy jungler.");
    await addGame(db, dana, { championId: "Ahri", result: "win" });
    await addGame(db, dana, { championId: "Ahri", result: "loss" });
    await finishBlock(db, dana, first.id);
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
