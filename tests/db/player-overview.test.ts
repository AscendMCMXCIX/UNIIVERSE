import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";
import { accountMastery, accountMatches, patches, riotAccounts } from "@/server/db/schema";
import { patchSortKey } from "@/domain/patch";
import { FixtureStaticProvider } from "@/server/riot/static/fixture";
import { syncStaticData } from "@/server/riot/static/sync";
import { createPlayer, getOrCreateTeam, getPlayer } from "@/server/repositories/team";
import { addAccount } from "@/server/accounts/repository";
import { getPlayerOverview } from "@/server/players/overview";

let handle: DbHandle;
let playerId: string;
let emptyId: string;
let mainId: string;
let altId: string;

beforeAll(async () => {
  handle = await testDb();
  await syncStaticData(handle.db, new FixtureStaticProvider(), { fingerprint: false });
  const db = handle.db;
  const team = await getOrCreateTeam(db);
  playerId = (await createPlayer(db, team.id, { displayName: "Ascend", primaryRole: "TOP", secondaryRole: "MID", primaryPool: ["Riven", "Gwen"], secondaryPool: ["Syndra"] })).id;
  emptyId = (await createPlayer(db, team.id, { displayName: "Newcomer", primaryRole: "ADC", primaryPool: ["Jinx"] })).id;
  mainId = (await addAccount(db, { ownerType: "player", playerId, riotId: "Ascend#OCE", platform: "oc1" })).id;
  altId = (await addAccount(db, { ownerType: "player", playerId, riotId: "AscendAlt#OCE", platform: "oc1" })).id;
  const backfill = (complete: boolean) => ({ season: 16, queues: { "420": { offset: 20, done: complete } }, startedAt: "2026-10-01T00:00:00Z", completedAt: complete ? "2026-10-02T00:00:00Z" : null });
  await db.update(riotAccounts).set({ puuid: "puuid-ascend", syncStatus: "ok", lastSyncAt: new Date(), tier: "EMERALD", division: "II", leaguePoints: 45, rankedWins: 120, rankedLosses: 100, historyBackfill: backfill(true) }).where(eq(riotAccounts.id, mainId));
  await db.update(riotAccounts).set({ puuid: "puuid-alt", syncStatus: "ok", lastSyncAt: new Date(), label: "alt", historyBackfill: backfill(false) }).where(eq(riotAccounts.id, altId));
  await db.update(patches).set({ isCurrent: false });
  await db.insert(patches).values(["16.19", "16.18", "16.2", "15.24"].map((id, i) => ({ id, ddragonVersion: `${id}.1`, isCurrent: i === 0, sortKey: patchSortKey(id) })));
  let n = 0;
  const game = (accountId: string, championId: string, queueId: number, win: boolean, patch: string, matchId?: string, role = "TOP") => ({ accountId, matchId: matchId ?? `OC1_${++n}`, gameCreation: 1_780_000_000_000 + ++n * 1000, queueId, championId, role, win, patch });
  await db.insert(accountMatches).values([
    // Riven: Solo on both accounts (early and late season), Flex, and Normal games.
    game(mainId, "Riven", 420, true, "16.19"),
    game(mainId, "Riven", 420, false, "16.18"),
    game(altId, "Riven", 420, true, "16.2"),
    game(mainId, "Riven", 440, true, "16.19"),
    game(mainId, "Riven", 400, true, "16.19"),
    game(mainId, "Riven", 490, false, "16.18"),
    // Last season: shown only when that season is chosen.
    game(mainId, "Riven", 420, true, "15.24"),
    game(mainId, "Gwen", 420, false, "15.24"),
    // One game seen from both accounts (duo with the alt): counts once.
    game(mainId, "Syndra", 420, true, "16.19", "OC1_SHARED", "MID"),
    game(altId, "Syndra", 420, true, "16.19", "OC1_SHARED", "MID"),
    // Outside the pools.
    game(altId, "Aatrox", 420, true, "16.19"),
    // A remake row without a champion is never counted.
    { accountId: mainId, matchId: "OC1_REMAKE", gameCreation: 1_780_000_000_000, queueId: 420 },
  ]);
  await db.insert(accountMastery).values([
    { accountId: mainId, championId: "Riven", points: 400_000, level: 7 },
    { accountId: altId, championId: "Riven", points: 250_000, level: 6 },
    { accountId: mainId, championId: "Gwen", points: 12_000, level: 3 },
  ]);
});
afterAll(async () => {
  await handle.close();
});

describe("Player overview (current season)", () => {
  it("defaults to the whole current season, all supported games, every champion; pool cards per role", async () => {
    const player = (await getPlayer(handle.db, playerId))!;
    const o = await getPlayerOverview(handle.db, player, { mode: "all", riotConfigured: true });
    expect(o.season).toBe(16);
    expect(o.seasons).toEqual([16, 15]);
    expect(o.cards.map((c) => c.championId)).toEqual(["Riven", "Gwen", "Syndra"]);
    expect(o.cards.map((c) => c.inPool)).toEqual(["primary", "primary", "secondary"]);
    const riven = o.cards[0]!;
    // Six Riven games this season across both accounts: 3 Solo, 1 Flex, 2 Normal.
    expect(riven.selected).toMatchObject({ games: 6, wins: 4, losses: 2 });
    expect(riven.solo).toMatchObject({ games: 3, wins: 2 });
    expect(riven.flex.games).toBe(1);
    expect(riven.normal).toMatchObject({ games: 2, wins: 1 });
    // Combined mastery with the account breakdown.
    expect(riven.mastery).toMatchObject({ points: 650_000, level: 7 });
    expect(riven.mastery!.accounts.map((a) => a.points)).toEqual([400_000, 250_000]);
    // Gwen: games only last season, so none now; mastery still shown; no invented win rate.
    expect(o.cards[1]!.selected).toMatchObject({ games: 0, winRate: null });
    expect(o.cards[1]!.mastery?.points).toBe(12_000);
    // The shared game counts once.
    expect(o.cards[2]!.selected.games).toBe(1);
    expect(o.record).toMatchObject({ games: 8, wins: 6 });
    // The headline figures count every champion (Aatrox included) unless narrowed.
    expect(o.summary.record).toMatchObject({ games: 8, wins: 6 });
    expect(o.byMode).toMatchObject({ solo: { games: 5 }, flex: { games: 1 }, normal: { games: 2 } });
    expect(o.rank?.text).toBe("Emerald II · 45 LP · 120W 100L");
    expect(o.accounts.map((a) => a.sync.label)).toEqual(["Up to date", "Catching up on history"]);
    // The alt is still collecting older games: the season is labelled partial.
    expect(o.completeness).toMatchObject({ complete: false, label: "Partial Data" });
    expect(o.completeness.detail).toMatch(/1 of 2/);
    expect(JSON.stringify(o)).not.toContain("puuid-");
  });

  it("filters by game mode and by season", async () => {
    const player = (await getPlayer(handle.db, playerId))!;
    const solo = await getPlayerOverview(handle.db, player, { mode: "solo", riotConfigured: true });
    expect(solo.cards[0]!.selected).toMatchObject({ games: 3, wins: 2 });
    expect(solo.record.games).toBe(5);
    const normal = await getPlayerOverview(handle.db, player, { mode: "normal", riotConfigured: true });
    expect(normal.cards[0]!.selected).toMatchObject({ games: 2, wins: 1, winRate: 0.5 });
    expect(normal.cards[2]!.selected.games).toBe(0);
    const flex = await getPlayerOverview(handle.db, player, { mode: "flex", riotConfigured: true });
    expect(flex.record.games).toBe(1);
    const last = await getPlayerOverview(handle.db, player, { season: 15, mode: "all", riotConfigured: true });
    expect(last.season).toBe(15);
    expect(last.cards[1]!.selected).toMatchObject({ games: 1, wins: 0 });
    expect(last.completeness).toMatchObject({ complete: false, label: "Partial Data" });
    // An unknown season falls back to the current one.
    expect((await getPlayerOverview(handle.db, player, { season: 3, mode: "all", riotConfigured: true })).season).toBe(16);
  });

  it("calls the season complete once every account has been read to the start of the season", async () => {
    await handle.db.update(riotAccounts).set({ historyBackfill: { season: 16, queues: {}, startedAt: "2026-10-01T00:00:00Z", completedAt: "2026-10-03T00:00:00Z" } }).where(eq(riotAccounts.id, altId));
    const player = (await getPlayer(handle.db, playerId))!;
    const o = await getPlayerOverview(handle.db, player, { mode: "all", riotConfigured: true });
    expect(o.completeness).toMatchObject({ complete: true, label: "Complete season" });
  });

  it("lists other champions played only on request, never inside the pool cards", async () => {
    const player = (await getPlayer(handle.db, playerId))!;
    const o = await getPlayerOverview(handle.db, player, { mode: "all", riotConfigured: true, includeOthers: true });
    expect(o.others.map((c) => c.championId)).toEqual(["Aatrox"]);
    expect(o.others[0]!.inPool).toBeNull();
    expect(o.cards.map((c) => c.championId)).not.toContain("Aatrox");
  });

  it("stays honest for a player without accounts or games", async () => {
    const player = (await getPlayer(handle.db, emptyId))!;
    const o = await getPlayerOverview(handle.db, player, { mode: "all", riotConfigured: true });
    expect(o.accounts).toEqual([]);
    expect(o.rank).toBeNull();
    expect(o.hasHistory).toBe(false);
    expect(o.cards[0]!.selected).toMatchObject({ games: 0, winRate: null });
    expect(o.cards[0]!.mastery).toBeNull();
    expect(o.cards[0]!.tier).toBe("unknown");
    expect(o.completeness.label).toBe("No Riot account");
    expect(o.lastSyncAt).toBeNull();
  });
});
