import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";
import { championChangePoints, championRoleStats, statPeriods } from "@/server/db/schema";
import { buildTrendsReport } from "@/server/trends";
import { createPlayer, getOrCreateTeam, listPlayers } from "@/server/repositories/team";
import { FixtureStaticProvider } from "@/server/riot/static/fixture";
import { syncStaticData } from "@/server/riot/static/sync";

/*
  R9 patch insights on pool champions (two seeded patches): a large, unlikely-by-chance shift in
  the role is reported as statistical; a small or thin one says nothing; a balance change
  recorded by a person is reported as such, kept apart from the statistics; an unconfirmed
  auto-detected change is not.
*/

let handle: DbHandle;

beforeAll(async () => {
  handle = await testDb();
  const db = handle.db;
  await syncStaticData(db, new FixtureStaticProvider(), { fingerprint: false });
  const team = await getOrCreateTeam(db);
  await createPlayer(db, team.id, { displayName: "Mid", primaryRole: "MID", primaryPool: ["Ahri", "Zed", "Lux", "Orianna"] });
  await db.insert(statPeriods).values([
    { patch: "16.20", source: "ranked", games: 60_000 },
    { patch: "16.19", source: "ranked", games: 60_000 },
  ]);
  await db.insert(championRoleStats).values([
    // Ahri: 52.0% → 48.0% on 5,000 games each: reported.
    { patch: "16.19", source: "ranked", tierBand: "EMERALD", championId: "Ahri", role: "MID", games: 5000, wins: 2600 },
    { patch: "16.20", source: "ranked", tierBand: "EMERALD", championId: "Ahri", role: "MID", games: 5000, wins: 2400 },
    // Zed: +1 point only: nothing.
    { patch: "16.19", source: "ranked", tierBand: "EMERALD", championId: "Zed", role: "MID", games: 8000, wins: 4000 },
    { patch: "16.20", source: "ranked", tierBand: "EMERALD", championId: "Zed", role: "MID", games: 8000, wins: 4080 },
    // Lux: a big swing on too few games: nothing.
    { patch: "16.19", source: "ranked", tierBand: "EMERALD", championId: "Lux", role: "MID", games: 400, wins: 160 },
    { patch: "16.20", source: "ranked", tierBand: "EMERALD", championId: "Lux", role: "MID", games: 400, wins: 240 },
  ]);
  await db.insert(championChangePoints).values([
    { championId: "Orianna", patch: "16.20", reason: "Ball speed reduced", source: "manual", confirmed: true },
    { championId: "Lux", patch: "16.20", reason: "Kit fingerprint changed", source: "auto", confirmed: false },
  ]);
}, 60_000);
afterAll(async () => {
  await handle.close();
});

describe("patch insights on pool champions", () => {
  it("reports only reliable statistical shifts and recorded changes, each labelled", async () => {
    const team = await getOrCreateTeam(handle.db);
    const lineup = await listPlayers(handle.db, team.id);
    const r = await buildTrendsReport(handle.db, "16.20", lineup);
    const byChampion = new Map(r.poolAlerts.map((a) => [a.championId, a]));
    expect(byChampion.get("Ahri")).toMatchObject({ kind: "statistical", severity: "warn" });
    expect(byChampion.get("Ahri")!.message).toMatch(/Mid win rate down 4\.0 points since 16\.19/);
    expect(byChampion.get("Ahri")!.detail).toMatch(/not a confirmed balance change/);
    expect(byChampion.get("Orianna")).toMatchObject({ kind: "verified" });
    expect(byChampion.get("Orianna")!.detail).toMatch(/Ball speed reduced/);
    expect(byChampion.has("Zed")).toBe(false);
    expect(byChampion.has("Lux")).toBe(false);
  });
});
