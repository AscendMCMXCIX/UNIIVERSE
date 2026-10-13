import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";
import { accountMatches, rankedBlocks, rankedGames } from "@/server/db/schema";
import { FixtureStaticProvider } from "@/server/riot/static/fixture";
import { syncStaticData } from "@/server/riot/static/sync";
import { createPlayer, deletePlayer, getOrCreateTeam } from "@/server/repositories/team";
import { addAccount } from "@/server/accounts/repository";
import { NotAuthorizedError } from "@/server/auth/session";
import { journalOwnerFor } from "@/server/ranked/owner";
import { addGame, deleteGame, finishBlock, getActiveBlock, getBlock, getDashboard, getStatistics, importMatch, JournalError, listBlocks, listGames, listImportableMatches, listTeammateOptions, startBlock, updateGame, updateRankedProfile, getRankedProfile } from "@/server/ranked/repository";
import { BLOCK_SIZE } from "@/domain/ranked-improvement";

let handle: DbHandle;
let teamId: string;
let alice: string;
let bob: string;
let carol: string;

beforeAll(async () => {
  handle = await testDb();
  await syncStaticData(handle.db, new FixtureStaticProvider(), { fingerprint: false });
  const team = await getOrCreateTeam(handle.db);
  teamId = team.id;
  const mk = async (name: string) => (await createPlayer(handle.db, teamId, { displayName: name, primaryRole: "ADC", primaryPool: ["Jinx"] }, team.poolLimits)).id;
  alice = await mk("Alice");
  bob = await mk("Bob");
  carol = await mk("Carol");
});
afterAll(async () => {
  await handle.close();
});

const session = (userId: string | null, playerId: string | null) => ({ userId, role: "player" as const, label: "x", playerId, username: "x", hasPassword: true, draftLead: false, setupComplete: true });

describe("TESTS — PRIVACY", () => {
  it("derives the owner from the session only: no user or no profile means no journal", () => {
    expect(() => journalOwnerFor(null)).toThrow(NotAuthorizedError);
    expect(() => journalOwnerFor(session(null, alice))).toThrow(NotAuthorizedError);
    expect(() => journalOwnerFor(session("u1", null))).toThrow(/profile/);
    expect(journalOwnerFor(session("u1", alice))).toBe(alice);
  });

  it("keeps one player's games, blocks and dashboard invisible to another", async () => {
    const db = handle.db;
    const { game, block } = await addGame(db, alice, { championId: "Jinx", result: "win", mainMistake: "mental", notes: "private note" });
    expect(await listGames(db, bob)).toEqual([]);
    expect(await listBlocks(db, bob)).toEqual([]);
    expect(await getBlock(db, bob, block.id)).toBeNull();
    expect((await getDashboard(db, bob)).totalGames).toBe(0);
    expect((await getStatistics(db, bob)).games).toBe(0);
    // Bob cannot edit or delete Alice's game, and it stays untouched.
    await expect(updateGame(db, bob, game.id, { championId: "Kaisa", result: "loss" })).rejects.toBeInstanceOf(JournalError);
    await expect(deleteGame(db, bob, game.id)).rejects.toBeInstanceOf(JournalError);
    await expect(finishBlock(db, bob, block.id)).rejects.toBeInstanceOf(JournalError);
    const [still] = await db.select().from(rankedGames).where(eq(rankedGames.id, game.id));
    expect(still?.championId).toBe("Jinx");
    expect(still?.notes).toBe("private note");
    // Alice's own view is intact.
    expect((await listGames(db, alice)).map((g) => g.id)).toEqual([game.id]);
  });

  it("tagging a teammate grants that teammate no access to the game", async () => {
    const db = handle.db;
    const { game } = await addGame(db, alice, { championId: "Kaisa", result: "loss", teammatePlayerId: bob });
    expect(await listGames(db, bob)).toEqual([]);
    expect(await listGames(db, bob, { teammate: alice })).toEqual([]);
    expect((await getStatistics(db, bob, { teammate: alice })).games).toBe(0);
    await expect(updateGame(db, bob, game.id, { championId: "Jinx", result: "win" })).rejects.toBeInstanceOf(JournalError);
    // The owner sees it, with the tag.
    const [own] = await listGames(db, alice, { teammate: bob });
    expect(own?.id).toBe(game.id);
    expect(own?.teammatePlayerId).toBe(bob);
    // Ranked focus is per owner too.
    await updateRankedProfile(db, alice, { champion1: "Jinx", focus: "Track the jungler." });
    expect((await getRankedProfile(db, bob)).focus).toBe("");
    expect((await getRankedProfile(db, alice)).focus).toBe("Track the jungler.");
  });
});

describe("TESTS — BLOCKS", () => {
  it("fills a block with six games, completes it on the sixth and numbers the next one", async () => {
    const db = handle.db;
    // Carol starts from nothing.
    expect(await getActiveBlock(db, carol)).toBeNull();
    let completedAt: boolean[] = [];
    for (let i = 1; i <= BLOCK_SIZE; i++) {
      const res = await addGame(db, carol, { championId: "Jinx", result: i % 2 ? "win" : "loss", mainMistake: "mechanics" });
      completedAt.push(res.blockCompleted);
      expect(res.block.label).toBe("BLOCK 001");
      expect(res.block.games).toBe(i);
    }
    expect(completedAt).toEqual([false, false, false, false, false, true]);
    const [first] = await listBlocks(db, carol);
    expect(first).toMatchObject({ number: 1, status: "completed", games: 6, wins: 3, losses: 3 });
    expect(first?.completedAt).toBeInstanceOf(Date);
    expect(await getActiveBlock(db, carol)).toBeNull();
    // The seventh game starts BLOCK 002 automatically.
    const seventh = await addGame(db, carol, { championId: "Kaisa", result: "win" });
    expect(seventh.block.label).toBe("BLOCK 002");
    expect(seventh.block.status).toBe("active");
    expect(seventh.blockCompleted).toBe(false);
    completedAt = [];
  });

  it("allows finishing early, keeps the block's actual size and never has two active blocks", async () => {
    const db = handle.db;
    const active = await getActiveBlock(db, carol);
    expect(active?.label).toBe("BLOCK 002");
    expect(await startBlock(db, carol)).toMatchObject({ id: active!.id, number: 2 });
    const finished = await finishBlock(db, carol, active!.id);
    expect(finished).toMatchObject({ number: 2, status: "completed", games: 1 });
    expect(await getActiveBlock(db, carol)).toBeNull();
    const next = await startBlock(db, carol);
    expect(next).toMatchObject({ number: 3, status: "active", games: 0 });
    expect(next.label).toBe("BLOCK 003");
    await expect(finishBlock(db, carol, next.id)).rejects.toThrow(/Add a game/);
    const actives = await db.select().from(rankedBlocks).where(eq(rankedBlocks.playerId, carol));
    expect(actives.filter((b) => b.status === "active")).toHaveLength(1);
    expect(actives.map((b) => b.number).sort()).toEqual([1, 2, 3]);
  });

  it("lets historical games be edited or deleted without reopening the block", async () => {
    const db = handle.db;
    const [first] = (await listBlocks(db, carol)).filter((b) => b.number === 1);
    const detail = await getBlock(db, carol, first!.id);
    expect(detail?.games).toHaveLength(6);
    const target = detail!.games[0]!;
    const updated = await updateGame(db, carol, target.id, { championId: "Ezreal", result: "loss", mainMistake: "wave-tempo", notes: "froze too long", link: "https://www.op.gg/x" });
    expect(updated).toMatchObject({ championId: "Ezreal", result: "loss", mainMistake: "wave-tempo", notes: "froze too long", link: "https://www.op.gg/x" });
    await deleteGame(db, carol, detail!.games[5]!.id);
    const after = await getBlock(db, carol, first!.id);
    expect(after?.block).toMatchObject({ status: "completed", games: 5 });
    expect(await getActiveBlock(db, carol)).toMatchObject({ number: 3 });
    // Validation guards the entry.
    await expect(addGame(db, carol, { championId: "", result: "win" })).rejects.toThrow(/champion/);
    await expect(addGame(db, carol, { championId: "Jinx", result: "draw" as never })).rejects.toThrow(/result/);
    await expect(addGame(db, carol, { championId: "Jinx", result: "win", mainMistake: "tilt" })).rejects.toThrow(/mistake/);
    await expect(addGame(db, carol, { championId: "Jinx", result: "win", link: "javascript:alert(1)" })).rejects.toThrow(/http/);
  });
});

describe("TESTS — GAME IMPORT", () => {
  let accountId: string;
  beforeAll(async () => {
    const db = handle.db;
    const account = await addAccount(db, { ownerType: "player", playerId: bob, riotId: "Bob Main#OCE", platform: "oc1" });
    accountId = account.id;
    const t0 = Date.parse("2026-10-10T10:00:00Z");
    await db.insert(accountMatches).values([
      { accountId, matchId: "OC1_1", gameCreation: t0 + 3_600_000, queueId: 420, championId: "Jinx", role: "ADC", win: true, enemyChampionId: "Caitlyn", patch: "26.19", gameDuration: 1800 },
      { accountId, matchId: "OC1_2", gameCreation: t0 + 2 * 3_600_000, queueId: 420, championId: "Kaisa", role: "ADC", win: false, enemyChampionId: null, patch: "26.19", gameDuration: 1500 },
      { accountId, matchId: "OC1_3", gameCreation: t0 + 3 * 3_600_000, queueId: 440, championId: "Jinx", role: "ADC", win: true, enemyChampionId: "Ashe", patch: "26.19", gameDuration: 1700 },
      { accountId, matchId: "OC1_4", gameCreation: t0, queueId: 420, championId: null, role: null, win: null, enemyChampionId: null, patch: null, gameDuration: null },
    ]);
  });

  it("offers only Solo/Duo games with known facts, newest first", async () => {
    const list = await listImportableMatches(handle.db, bob);
    expect(list.map((m) => m.matchId)).toEqual(["OC1_2", "OC1_1"]);
    expect(list[1]).toMatchObject({ accountId, riotId: "Bob Main#OCE", championId: "Jinx", enemyChampionId: "Caitlyn", role: "ADC", win: true, gameDuration: 1800 });
    expect(list[1]!.playedAt.toISOString()).toBe("2026-10-10T11:00:00.000Z");
    // Nobody else's accounts feed Bob's list, and Alice (no accounts) has nothing to import.
    expect(await listImportableMatches(handle.db, alice)).toEqual([]);
  });

  it("imports a match with its facts filled in and never imports it twice", async () => {
    const db = handle.db;
    const { game, block } = await importMatch(db, bob, "OC1_1", { mainMistake: "positioning-teamfight" });
    expect(game).toMatchObject({ championId: "Jinx", enemyChampionId: "Caitlyn", result: "win", role: "ADC", accountId, riotMatchId: "OC1_1", mainMistake: "positioning-teamfight" });
    expect(game.playedAt.toISOString()).toBe("2026-10-10T11:00:00.000Z");
    expect(block.label).toBe("BLOCK 001");
    await expect(importMatch(db, bob, "OC1_1")).rejects.toThrow(/already in your journal/);
    expect((await listImportableMatches(db, bob)).map((m) => m.matchId)).toEqual(["OC1_2"]);
    // Manual entry carrying the same match id is also refused; a manual game without one is fine.
    await expect(addGame(db, bob, { championId: "Jinx", result: "win", riotMatchId: "OC1_1" })).rejects.toThrow(/already/);
    const manual = await addGame(db, bob, { championId: "Jinx", result: "loss" });
    expect(manual.game.riotMatchId).toBeNull();
    expect(manual.game.accountId).toBeNull();
  });

  it("refuses flex games, unknown matches and other players' matches; manual entry needs no Riot data", async () => {
    const db = handle.db;
    await expect(importMatch(db, bob, "OC1_3")).rejects.toThrow(/Solo\/Duo/);
    await expect(importMatch(db, bob, "OC1_4")).rejects.toThrow(/not in your synced/);
    await expect(importMatch(db, bob, "OC1_nope")).rejects.toThrow(/not in your synced/);
    await expect(importMatch(db, alice, "OC1_2")).rejects.toThrow(/not in your synced/);
    const res = await addGame(db, alice, { championId: "Ashe", result: "win", enemyChampionId: "Jinx", notes: "no account linked" });
    expect(res.game.championId).toBe("Ashe");
    // An account id that belongs to someone else is rejected.
    await expect(addGame(db, alice, { championId: "Ashe", result: "win", accountId })).rejects.toThrow(/not linked/);
  });
});

describe("TESTS — TEAMMATE TAGGING", () => {
  it("tags existing team members only, filters by teammate, and survives the teammate leaving", async () => {
    const db = handle.db;
    const dave = (await createPlayer(db, teamId, { displayName: "Dave", primaryRole: "SUPPORT", primaryPool: ["Lulu"] }, (await getOrCreateTeam(db)).poolLimits)).id;
    const options = await listTeammateOptions(db, teamId, alice);
    expect(options.map((o) => o.displayName)).toEqual(["Bob", "Carol", "Dave"]);
    await expect(addGame(db, alice, { championId: "Jinx", result: "win", teammatePlayerId: alice })).rejects.toThrow(/yourself/);
    await expect(addGame(db, alice, { championId: "Jinx", result: "win", teammatePlayerId: "00000000-0000-0000-0000-000000000000" })).rejects.toThrow(/no longer exists/);
    const withDave = await addGame(db, alice, { championId: "Jinx", result: "win", teammatePlayerId: dave, mainMistake: "vision-awareness" });
    expect((await listGames(db, alice, { teammate: dave })).map((g) => g.id)).toEqual([withDave.game.id]);
    expect((await listGames(db, alice, { teammate: "solo" })).some((g) => g.id === withDave.game.id)).toBe(false);
    expect((await listGames(db, alice, { teammate: bob })).every((g) => g.teammatePlayerId === bob)).toBe(true);
    expect((await getStatistics(db, alice, { teammate: dave })).games).toBe(1);
    // Dave is deleted: the game stays, untagged.
    await deletePlayer(db, dave);
    const [kept] = await db.select().from(rankedGames).where(eq(rankedGames.id, withDave.game.id));
    expect(kept?.teammatePlayerId).toBeNull();
    expect((await listGames(db, alice, { teammate: "solo" })).some((g) => g.id === withDave.game.id)).toBe(true);
  });
});

describe("TESTS — DASHBOARD", () => {
  it("counts partial blocks correctly and reports the most common mistake and matchups", async () => {
    const db = handle.db;
    // Carol: BLOCK 001 (5 games after one deletion), BLOCK 002 (1 game), BLOCK 003 (empty, active).
    const dash = await getDashboard(db, carol);
    const all = await listGames(db, carol, { limit: 100 });
    expect(dash.totalGames).toBe(all.length);
    expect(dash.totalGames).toBe(6);
    expect(dash.wins).toBe(all.filter((g) => g.result === "win").length);
    expect(dash.winRate).toBeCloseTo(dash.wins / 6);
    expect(dash.mostCommonMistake?.key).toBe("mechanics");
    await updateRankedProfile(db, carol, { focus: "  Stop chasing kills.  " });
    expect((await getDashboard(db, carol)).focus).toBe("Stop chasing kills.");
    const stats = await getStatistics(db, carol);
    expect(stats.games).toBe(6);
    expect(stats.champions.reduce((s, c) => s + c.games, 0)).toBe(6);
    expect(stats.mistakes.find((m) => m.key === "mechanics")?.count).toBe(4);
    // A matchup needs an enemy champion.
    await addGame(db, carol, { championId: "Jinx", result: "win", enemyChampionId: "Caitlyn" });
    await addGame(db, carol, { championId: "Jinx", result: "loss", enemyChampionId: "Caitlyn" });
    const after = await getStatistics(db, carol);
    expect(after.matchups).toEqual([{ championId: "Jinx", enemyChampionId: "Caitlyn", games: 2, wins: 1, losses: 1 }]);
    expect((await getDashboard(db, carol)).totalGames).toBe(8);
    expect((await getActiveBlock(db, carol))?.games).toBe(2);
  });
});
