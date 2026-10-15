import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";
import { accountChampionHistory, patches } from "@/server/db/schema";
import { patchSortKey } from "@/domain/patch";
import { FixtureStaticProvider } from "@/server/riot/static/fixture";
import { syncStaticData } from "@/server/riot/static/sync";
import { createPlayer, getOrCreateTeam, setLineupSlot } from "@/server/repositories/team";
import { addAccount } from "@/server/accounts/repository";
import { candidatesFor, getTeamOverview } from "@/server/team/overview";

let handle: DbHandle;
let teamId: string;
let top: string;
let sub: string;

beforeAll(async () => {
  handle = await testDb();
  await syncStaticData(handle.db, new FixtureStaticProvider(), { fingerprint: false });
  const db = handle.db;
  const team = await getOrCreateTeam(db);
  teamId = team.id;
  top = (await createPlayer(db, teamId, { displayName: "Ascend", primaryRole: "TOP", secondaryRole: "MID", primaryPool: ["Riven", "Gwen"], secondaryPool: ["Syndra"] })).id;
  await createPlayer(db, teamId, { displayName: "Jungler", primaryRole: "JUNGLE", primaryPool: ["Viego"] });
  // Phase 11 retired the "Other players" group: a second Top player is an ordinary team profile.
  sub = (await createPlayer(db, teamId, { displayName: "Sub Top", primaryRole: "TOP", primaryPool: ["Sion"] })).id;
  await setLineupSlot(db, teamId, "TOP", top);
  const account = await addAccount(db, { ownerType: "player", playerId: top, riotId: "Ascend#OCE", platform: "oc1" });
  // Four real patches (the offline fixture's own "0.0" stays as an old row): history on the current one and on the oldest.
  await db.update(patches).set({ isCurrent: false });
  await db.insert(patches).values(["26.19", "26.18", "26.17", "26.16"].map((id, i) => ({ id, ddragonVersion: `${id}.1`, isCurrent: i === 0, sortKey: patchSortKey(id) })));
  await db.insert(accountChampionHistory).values([
    { accountId: account.id, championId: "Riven", role: "TOP", queueGroup: "solo", patch: "26.19", games: 12, wins: 7 },
    { accountId: account.id, championId: "Riven", role: "TOP", queueGroup: "flex", patch: "26.19", games: 4, wins: 3 },
    { accountId: account.id, championId: "Riven", role: "TOP", queueGroup: "normal", patch: "26.19", games: 30, wins: 30 },
    { accountId: account.id, championId: "Gwen", role: "TOP", queueGroup: "solo", patch: "26.16", games: 50, wins: 40 },
  ]);
});
afterAll(async () => {
  await handle.close();
});

describe("Team overview", () => {
  it("shows the five slots with the assigned main player, their champions for the role and labelled ranked context", async () => {
    const overview = await getTeamOverview(handle.db, teamId);
    expect(overview.rows.map((r) => r.role)).toEqual(["TOP", "JUNGLE", "MID", "ADC", "SUPPORT"]);
    const topRow = overview.rows[0]!;
    expect(topRow.player?.displayName).toBe("Ascend");
    expect(topRow.profileRole).toBe("primary");
    expect(topRow.substitute).toBe(false);
    expect(topRow.pool.map((c) => c.championId)).toEqual(["Riven", "Gwen"]);
    // Recent context counts ranked games on the current and previous two patches only: normals and old patches stay out.
    expect(topRow.pool[0]!.recent).toMatchObject({ games: 16, wins: 10 });
    expect(topRow.pool[0]!.recent.winRate).toBeCloseTo(10 / 16);
    expect(topRow.pool[1]!.recent.games).toBe(0);
    expect(topRow.pool[1]!.recent.winRate).toBeNull();
    expect(["core", "strong", "comfortable", "moderate", "rusty", "unknown"]).toContain(topRow.pool[0]!.tier);
    expect(overview.rows[1]!.player).toBeNull();
    expect(overview.complete).toBe(false);
    // One kind of team profile: everyone who lists the role is offered for it.
    expect(overview.main.map((p) => p.displayName)).toEqual(["Ascend", "Jungler", "Sub Top"]);
    expect(overview.other).toEqual([]);
    expect(candidatesFor("TOP", overview, false).map((p) => p.displayName)).toEqual(["Ascend", "Sub Top"]);
    expect(candidatesFor("MID", overview, false).map((p) => p.displayName)).toEqual(["Ascend"]);
  });

  it("marks a player on their secondary role; nobody is a substitute any more", async () => {
    const db = handle.db;
    await setLineupSlot(db, teamId, "TOP", sub);
    await setLineupSlot(db, teamId, "MID", top);
    const overview = await getTeamOverview(db, teamId);
    expect(overview.rows[0]).toMatchObject({ substitute: false, profileRole: "primary" });
    expect(overview.rows[0]!.pool.map((c) => c.championId)).toEqual(["Sion"]);
    expect(overview.rows[2]).toMatchObject({ substitute: false, profileRole: "secondary" });
    expect(overview.rows[2]!.pool.map((c) => c.championId)).toEqual(["Syndra"]);
  });
});
