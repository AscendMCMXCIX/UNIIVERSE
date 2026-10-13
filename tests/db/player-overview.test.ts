import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";
import { accountChampionHistory, patches, riotAccounts } from "@/server/db/schema";
import { patchSortKey } from "@/domain/patch";
import { FixtureStaticProvider } from "@/server/riot/static/fixture";
import { syncStaticData } from "@/server/riot/static/sync";
import { createPlayer, getOrCreateTeam, getPlayer } from "@/server/repositories/team";
import { addAccount } from "@/server/accounts/repository";
import { getPlayerOverview } from "@/server/players/overview";

let handle: DbHandle;
let playerId: string;
let emptyId: string;

beforeAll(async () => {
  handle = await testDb();
  await syncStaticData(handle.db, new FixtureStaticProvider(), { fingerprint: false });
  const db = handle.db;
  const team = await getOrCreateTeam(db);
  playerId = (await createPlayer(db, team.id, { displayName: "Ascend", primaryRole: "TOP", secondaryRole: "MID", primaryPool: ["Riven", "Gwen"], secondaryPool: ["Syndra"] }, team.poolLimits)).id;
  emptyId = (await createPlayer(db, team.id, { displayName: "Newcomer", primaryRole: "ADC", primaryPool: ["Jinx"] }, team.poolLimits)).id;
  const account = await addAccount(db, { ownerType: "player", playerId, riotId: "Ascend#OCE", platform: "oc1" });
  await db.update(riotAccounts).set({ puuid: "puuid-ascend", syncStatus: "ok", lastSyncAt: new Date(), tier: "EMERALD", division: "II", leaguePoints: 45, rankedWins: 120, rankedLosses: 100 }).where(eq(riotAccounts.id, account.id));
  await db.update(patches).set({ isCurrent: false });
  await db.insert(patches).values(["26.19", "26.18", "26.17", "26.16"].map((id, i) => ({ id, ddragonVersion: `${id}.1`, isCurrent: i === 0, sortKey: patchSortKey(id) })));
  await db.insert(accountChampionHistory).values([
    { accountId: account.id, championId: "Riven", role: "TOP", queueGroup: "solo", patch: "26.19", games: 12, wins: 7 },
    { accountId: account.id, championId: "Riven", role: "TOP", queueGroup: "flex", patch: "26.19", games: 4, wins: 3 },
    { accountId: account.id, championId: "Riven", role: "TOP", queueGroup: "normal", patch: "26.19", games: 30, wins: 30 },
    { accountId: account.id, championId: "Gwen", role: "TOP", queueGroup: "solo", patch: "26.16", games: 50, wins: 40 },
    { accountId: account.id, championId: "Syndra", role: "MID", queueGroup: "solo", patch: "26.18", games: 6, wins: 2 },
    { accountId: account.id, championId: "Aatrox", role: "TOP", queueGroup: "solo", patch: "26.19", games: 5, wins: 3 },
  ]);
});
afterAll(async () => {
  await handle.close();
});

describe("Player overview", () => {
  it("shows pool champions only by default, with the selected mode and the fixed Solo/Duo, Flex and recent context", async () => {
    const player = (await getPlayer(handle.db, playerId))!;
    const o = await getPlayerOverview(handle.db, player, { mode: "ranked", window: 2, riotConfigured: true });
    expect(o.cards.map((c) => c.championId)).toEqual(["Riven", "Gwen", "Syndra"]);
    expect(o.cards.map((c) => c.inPool)).toEqual(["primary", "primary", "secondary"]);
    expect(o.cards[2]!.role).toBe("MID");
    const riven = o.cards[0]!;
    expect(riven.selected).toMatchObject({ games: 16, wins: 10 });
    expect(riven.solo).toMatchObject({ games: 12, wins: 7 });
    expect(riven.flex).toMatchObject({ games: 4, wins: 3 });
    expect(riven.recentThreePatches.games).toBe(16);
    expect(riven.tierLabel.length).toBeGreaterThan(0);
    // Gwen's games are three patches old: outside the default window, so no number is invented.
    expect(o.cards[1]!.selected.games).toBe(0);
    expect(o.cards[1]!.selected.winRate).toBeNull();
    expect(o.others).toEqual([]);
    expect(o.othersRequested).toBe(false);
    expect(o.hasHistory).toBe(true);
    // Quick reference: every ranked game in the window, whatever the champion.
    expect(o.solo).toMatchObject({ games: 23, wins: 12, losses: 11 });
    expect(o.flex).toMatchObject({ games: 4, wins: 3 });
    expect(o.currentPatchGames).toBe(21);
    expect(o.currentPatch).toBe("26.19");
    expect(o.rank?.text).toBe("Emerald II · 45 LP · 120W 100L");
    expect(o.accounts).toHaveLength(1);
    expect(o.accounts[0]).toMatchObject({ riotId: "Ascend#OCE", platformLabel: expect.any(String) });
    expect(o.accounts[0]!.sync.state).toBe("synced");
    expect(o.lastSyncAt).toBeInstanceOf(Date);
    expect(JSON.stringify(o)).not.toContain("puuid-ascend");
  });

  it("applies the game-mode and patch-window dropdowns", async () => {
    const player = (await getPlayer(handle.db, playerId))!;
    const solo = await getPlayerOverview(handle.db, player, { mode: "solo", window: 0, riotConfigured: true });
    expect(solo.cards[0]!.selected).toMatchObject({ games: 12, wins: 7 });
    expect(solo.cards[2]!.selected.games).toBe(0); // Syndra's games are on the previous patch
    expect(solo.solo.games).toBe(17);
    const flex = await getPlayerOverview(handle.db, player, { mode: "flex", window: 2, riotConfigured: true });
    expect(flex.cards[0]!.selected).toMatchObject({ games: 4, wins: 3 });
    expect(flex.cards[2]!.selected.games).toBe(0);
    const all = await getPlayerOverview(handle.db, player, { mode: "ranked", window: "all", riotConfigured: true });
    expect(all.cards[1]!.selected).toMatchObject({ games: 50, wins: 40 });
    expect(all.cards[1]!.selected.winRate).toBeCloseTo(0.8);
  });

  it("lists other champions played only on request, never inside the pool cards", async () => {
    const player = (await getPlayer(handle.db, playerId))!;
    const o = await getPlayerOverview(handle.db, player, { mode: "ranked", window: 2, riotConfigured: true, includeOthers: true });
    expect(o.othersRequested).toBe(true);
    expect(o.others.map((c) => c.championId)).toEqual(["Aatrox"]);
    expect(o.others[0]!.inPool).toBeNull();
    expect(o.others[0]!.selected).toMatchObject({ games: 5, wins: 3 });
    expect(o.cards.map((c) => c.championId)).not.toContain("Aatrox");
  });

  it("stays honest for a player without accounts or games", async () => {
    const player = (await getPlayer(handle.db, emptyId))!;
    const o = await getPlayerOverview(handle.db, player, { mode: "ranked", window: 2, riotConfigured: true });
    expect(o.accounts).toEqual([]);
    expect(o.rank).toBeNull();
    expect(o.hasHistory).toBe(false);
    expect(o.cards.map((c) => c.championId)).toEqual(["Jinx"]);
    expect(o.cards[0]!.selected).toMatchObject({ games: 0, winRate: null });
    expect(o.cards[0]!.tier).toBe("unknown");
    expect(o.solo.games).toBe(0);
    expect(o.lastSyncAt).toBeNull();
  });
});
