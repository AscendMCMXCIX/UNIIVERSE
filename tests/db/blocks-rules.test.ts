import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";
import { accountMatches, rankedBlocks, rankedGames } from "@/server/db/schema";
import { FixtureStaticProvider } from "@/server/riot/static/fixture";
import { syncStaticData } from "@/server/riot/static/sync";
import { createPlayer, getOrCreateTeam } from "@/server/repositories/team";
import { addAccount } from "@/server/accounts/repository";
import { addGame, deleteBlock, deleteGame, finishBlock, getActiveBlock, getBlock, importMatch, listBlocks, setBlockSize, startBlock, updateGame } from "@/server/ranked/repository";
import { blockStatusText } from "@/domain/ranked-improvement";

/*
  Solo Queue Blocks completion rules (game target, two-loss limit, manual) and deleting a block:
  imports, duplicates, edited results, deleted games, corrections after completion, a new block
  after the limit, ownership, and Riot match data left untouched.
*/

let handle: DbHandle;
let ana: string;
let ben: string;
let cal: string;
let dee: string;

beforeAll(async () => {
  handle = await testDb();
  await syncStaticData(handle.db, new FixtureStaticProvider(), { fingerprint: false });
  const team = await getOrCreateTeam(handle.db);
  const mk = async (name: string) => (await createPlayer(handle.db, team.id, { displayName: name, primaryRole: "MID", primaryPool: ["Ahri"] })).id;
  ana = await mk("Ana");
  ben = await mk("Ben");
  cal = await mk("Cal");
  dee = await mk("Dee");
}, 60_000);
afterAll(async () => {
  await handle.close();
});

const game = (result: "win" | "loss") => ({ championId: "Ahri", result });

describe("completion rules", () => {
  it("a game target never completes a block by itself, whatever the losses", async () => {
    const db = handle.db;
    const block = await startBlock(db, ana, 3);
    expect(block.completionRule).toBe("target");
    for (const r of ["loss", "loss", "loss", "loss"] as const) await addGame(db, ana, game(r));
    expect((await getActiveBlock(db, ana))!).toMatchObject({ id: block.id, games: 4, losses: 4, status: "active" });
    const done = await finishBlock(db, ana, block.id);
    expect(done).toMatchObject({ status: "completed", completedReason: "manual" });
  });

  it("the two-loss limit completes the block on its second loss (losses in total, not in a row)", async () => {
    const db = handle.db;
    const block = await startBlock(db, ben, null, "two-losses");
    expect(block).toMatchObject({ completionRule: "two-losses", plannedGames: null });
    // A two-loss block has no game target.
    await expect(setBlockSize(db, ben, block.id, 5)).rejects.toThrow(/second loss/);
    expect((await addGame(db, ben, game("loss"))).limitReached).toBe(false);
    expect((await addGame(db, ben, game("win"))).limitReached).toBe(false);
    const third = await addGame(db, ben, game("loss"));
    expect(third.limitReached).toBe(true);
    expect(third.block).toMatchObject({ status: "completed", completedReason: "two-losses", games: 3, wins: 1, losses: 2 });
    expect(blockStatusText(third.block)).toBe("Completed · 2-loss limit reached");
    expect(await getActiveBlock(db, ben)).toBeNull();
  });

  it("corrections: a fixed result or a deleted loss reopens the latest block; a new loss completes it again", async () => {
    const db = handle.db;
    const [latest] = await listBlocks(db, ben, { limit: 1 });
    const { games } = (await getBlock(db, ben, latest!.id))!;
    const lastLoss = games.filter((g) => g.result === "loss").at(-1)!;
    // The second loss was entered wrongly: it was a win. The block is under the limit again.
    await updateGame(db, ben, lastLoss.id, { ...game("win") });
    expect((await getBlock(db, ben, latest!.id))!.block).toMatchObject({ status: "active", completedReason: null, losses: 1 });
    // Completion during an edit: making it a loss again completes the block again.
    await updateGame(db, ben, lastLoss.id, { ...game("loss") });
    expect((await getBlock(db, ben, latest!.id))!.block).toMatchObject({ status: "completed", completedReason: "two-losses" });
    // Deleting a loss reopens it the same way.
    await deleteGame(db, ben, lastLoss.id);
    expect((await getBlock(db, ben, latest!.id))!.block).toMatchObject({ status: "active", losses: 1, games: 2 });
    await addGame(db, ben, game("loss"));
    expect((await getBlock(db, ben, latest!.id))!.block.status).toBe("completed");
  });

  it("after the limit, the next game starts a new block under the same rule; the older block stays completed", async () => {
    const db = handle.db;
    const before = (await listBlocks(db, ben, { limit: 1 }))[0]!;
    const { block: next } = await addGame(db, ben, game("win"));
    expect(next).toMatchObject({ number: before.number + 1, completionRule: "two-losses", status: "active", games: 1 });
    // A correction on the older block cannot reopen it any more (it is no longer the latest).
    const old = (await getBlock(db, ben, before.id))!;
    const aLoss = old.games.find((g) => g.result === "loss")!;
    await updateGame(db, ben, aLoss.id, { ...game("win") });
    const after = (await getBlock(db, ben, before.id))!.block;
    expect(after).toMatchObject({ status: "completed", losses: 1 });
    // Its label tells the truth about what it holds now.
    expect(blockStatusText(after)).toBe("Completed");
    expect((await getActiveBlock(db, ben))!.id).toBe(next.id);
  });

  it("a block the player finished never reopens, and an explicit rule wins over the previous block's", async () => {
    const db = handle.db;
    const b = await startBlock(db, cal, null, "two-losses");
    const { game: g1 } = await addGame(db, cal, game("loss"));
    await finishBlock(db, cal, b.id);
    await updateGame(db, cal, g1.id, { ...game("win") });
    expect((await getBlock(db, cal, b.id))!.block).toMatchObject({ status: "completed", completedReason: "manual" });
    const target = await startBlock(db, cal, 4, "target");
    expect(target).toMatchObject({ completionRule: "target", plannedGames: 4 });
  });

  it("imports follow the rule, and a game is never journaled twice", async () => {
    const db = handle.db;
    const acc = (await addAccount(db, { ownerType: "player", playerId: dee, riotId: "Dee#OCE", platform: "oc1" })).id;
    const base = { accountId: acc, queueId: 420, patch: "16.20", gameDuration: 1800, championId: "Ahri", role: "MID" };
    await db.insert(accountMatches).values([
      { ...base, matchId: "OC1_901", win: false, gameCreation: Date.parse("2026-10-14T10:00:00Z") },
      { ...base, matchId: "OC1_902", win: true, gameCreation: Date.parse("2026-10-14T11:00:00Z") },
      { ...base, matchId: "OC1_903", win: false, gameCreation: Date.parse("2026-10-14T12:00:00Z") },
    ]);
    await startBlock(db, dee, null, "two-losses");
    await importMatch(db, dee, "OC1_901");
    await expect(importMatch(db, dee, "OC1_901")).rejects.toThrow(/already in your journal/);
    await importMatch(db, dee, "OC1_902");
    const third = await importMatch(db, dee, "OC1_903");
    expect(third.limitReached).toBe(true);
    expect(third.block).toMatchObject({ status: "completed", completedReason: "two-losses", games: 3 });
  });
});

describe("deleting a block", () => {
  it("removes the block and its journal entries in one go, never the Riot match data; other labels never change", async () => {
    const db = handle.db;
    const [completed] = await listBlocks(db, dee, { limit: 1 });
    const before = await db.select().from(accountMatches).where(eq(accountMatches.matchId, "OC1_901"));
    const removed = await deleteBlock(db, dee, completed!.id);
    expect(removed).toEqual({ label: completed!.label, games: 3 });
    expect(await db.select().from(rankedBlocks).where(eq(rankedBlocks.id, completed!.id))).toHaveLength(0);
    expect(await db.select().from(rankedGames).where(eq(rankedGames.blockId, completed!.id))).toHaveLength(0);
    // The synced Riot game is still there, and can be journaled again.
    expect(await db.select().from(accountMatches).where(eq(accountMatches.matchId, "OC1_901"))).toEqual(before);
    const again = await importMatch(db, dee, "OC1_901");
    // Other blocks keep their labels; the deleted block was the latest, so the next block takes its number.
    expect(again.block.number).toBe(completed!.number);
    // An active block can be deleted too.
    const active = (await getActiveBlock(db, dee))!;
    await deleteBlock(db, dee, active.id);
    expect(await getActiveBlock(db, dee)).toBeNull();
  });

  it("another player's block is not found and nothing is removed", async () => {
    const db = handle.db;
    const [bens] = await listBlocks(db, ben, { limit: 1 });
    await expect(deleteBlock(db, cal, bens!.id)).rejects.toThrow(/not found/);
    expect(await db.select().from(rankedBlocks).where(and(eq(rankedBlocks.id, bens!.id), eq(rankedBlocks.playerId, ben)))).toHaveLength(1);
  });
});
