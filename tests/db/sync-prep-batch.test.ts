import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";
import { accountMatchPrep, accountMatches, matchDetails, riotAccounts, type MatchParticipantDetail } from "@/server/db/schema";
import { FixtureStaticProvider } from "@/server/riot/static/fixture";
import { syncStaticData } from "@/server/riot/static/sync";
import { createPlayer, getOrCreateTeam } from "@/server/repositories/team";
import { foldMissingPresences } from "@/server/accounts/sync";
import * as prepStore from "@/server/matchup-intel/prep-store";
import fixture from "@/server/riot/fixtures/champions.fixture.json";

/*
  R7 review B4: folding games makes their Matchup Intel evidence rows once a run, for every game it
  folded, not once a game (each call is about five queries and empties the instance's evidence
  cache).
*/

vi.mock("@/server/matchup-intel/prep-store", async (original) => {
  const real = await original<typeof import("@/server/matchup-intel/prep-store")>();
  return { ...real, refreshMatchPrep: vi.fn(real.refreshMatchPrep) };
});

const keyOf = (id: string) => fixture.champions.find((c) => c.id === id)!.key;
const NOW = new Date(Date.UTC(2026, 10, 4, 12));
const part = (puuid: string, teamId: number, champion: string, position: string): MatchParticipantDetail => ({ puuid, name: null, teamId, championId: champion, championKey: keyOf(champion), champLevel: 15, position, teamPosition: position, individualPosition: position, win: teamId === 100, kills: 3, deaths: 2, assists: 4, cs: 150, gold: 9000, damage: 12000, damageTaken: 15000, vision: 20, wardsPlaced: 8, items: null, spells: [4, 14], runes: null }) as MatchParticipantDetail;

let handle: DbHandle;
let bea = "";
beforeAll(async () => {
  handle = await testDb();
  const db = handle.db;
  await syncStaticData(db, new FixtureStaticProvider(), { fingerprint: false });
  const teamId = (await getOrCreateTeam(db)).id;
  const ids: Record<string, string> = {};
  for (const key of ["ace", "bea"]) {
    const player = await createPlayer(db, teamId, { displayName: key, primaryRole: "MID", primaryPool: ["Ahri"] });
    const [row] = await db.insert(riotAccounts).values({ ownerType: "player", playerId: player.id, gameName: key, tagLine: "T", platform: "oc1", puuid: `p-${key}`, label: "main" }).returning({ id: riotAccounts.id });
    ids[key] = row!.id;
  }
  bea = ids.bea!;
  for (const [i, matchId] of ["OC1_A", "OC1_B"].entries()) {
    await db.insert(accountMatches).values({ accountId: ids.ace!, matchId, gameCreation: NOW.getTime() - (i + 1) * 86_400_000, queueId: 400, championId: "Ahri", role: "MIDDLE", win: true, patch: "16.20", gameDuration: 1800, kills: 3, deaths: 2, assists: 4 });
    await db.insert(matchDetails).values({ matchId, platform: "oc1", queueId: 400, gameCreation: NOW.getTime() - (i + 1) * 86_400_000, gameDuration: 1800, gameVersion: "16.20.1.1", teams: [], participants: [part("p-ace", 100, "Ahri", "MIDDLE"), part("p-bea", 100, "Gwen", "TOP"), part("s1", 200, "Ahri", "MIDDLE"), part("s2", 200, "Gwen", "TOP")] });
  }
}, 60_000);
afterAll(async () => {
  await handle.close();
});

it("makes the evidence rows of every folded game in one call a run", async () => {
  const spy = vi.mocked(prepStore.refreshMatchPrep);
  spy.mockClear();
  const out = await foldMissingPresences(handle.db, { now: NOW });
  expect(out.folded).toBe(2);
  expect(spy).toHaveBeenCalledTimes(1);
  expect([...spy.mock.calls[0]![1]].sort()).toEqual(["OC1_A", "OC1_B"]);
  expect((await handle.db.select({ m: accountMatchPrep.matchId }).from(accountMatchPrep).where(eq(accountMatchPrep.accountId, bea))).length).toBe(2);
});
