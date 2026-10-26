import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";
import { matchDetails, type MatchParticipantDetail } from "@/server/db/schema";
import { createPlayer, getOrCreateTeam } from "@/server/repositories/team";
import { addAccount } from "@/server/accounts/repository";
import { opggCoverage } from "@/server/players/riot-names";

/*
  The data audit's OP.GG link coverage (server/players/riot-names opggCoverage): of the places in
  the Riot games stored over the last 30 days, how many have a link and from which Riot ID (a
  linked account's, a newer game's or the game's own), and why the others have none. Counts only:
  nobody is named.
*/

const NOW = new Date("2026-10-20T10:00:00Z");
const DAY = 86_400_000;
let handle: DbHandle;

const part = (puuid: string, name: string | null, teamId = 100, over: Partial<MatchParticipantDetail> = {}): MatchParticipantDetail => ({
  puuid,
  name,
  teamId,
  championId: "Ahri",
  championKey: 0,
  champLevel: 15,
  position: null,
  win: teamId === 100,
  kills: 1,
  deaths: 1,
  assists: 1,
  cs: 100,
  gold: 9000,
  damage: 10000,
  damageTaken: 10000,
  vision: 10,
  wardsPlaced: 5,
  items: null,
  spells: null,
  runes: null,
  ...over,
});

beforeAll(async () => {
  handle = await testDb();
  const db = handle.db;
  const team = await getOrCreateTeam(db);
  const member = await createPlayer(db, team.id, { displayName: "Member", primaryRole: "MID", primaryPool: [] });
  await addAccount(db, { ownerType: "player", playerId: member.id, riotId: "Member Now#OCE", platform: "oc1", puuid: "m-1" });
  const game = (matchId: string, daysAgo: number, participants: MatchParticipantDetail[]) =>
    db.insert(matchDetails).values({ matchId, platform: "oc1", queueId: 420, gameCreation: NOW.getTime() - daysAgo * DAY, gameDuration: 1800, gameVersion: "16.20.1", teams: [], participants });
  // The member under an older name, x-1 before a rename, and one place for each reason a link cannot be made.
  await game("OC1_1", 10, [
    part("m-1", "Member Old#OCE"),
    part("x-1", "Before#OCE"),
    part("x-2", "NoTag"),
    part("x-3", "Short#AB"),
    part("x-4", "Bad#A-B"),
    part("x-5", "ThisNameIsWayTooLongForRiot#OCE", 200),
    // 13 characters as Riot counts them (18 code points): a link now, none before.
    part("x-6", "สวัสดีครับผมชื่อสม#TH2", 200),
    part("x-7", null, 200),
    { ...part("", null, 200), championId: null, removed: true },
    part("x-8", "Fine#OCE", 200),
  ]);
  // Newer: x-1 renamed, and x-2 still without a tag.
  await game("OC1_2", 5, [part("x-1", "After#OCE"), part("x-2", "NoTag")]);
  // Never counted: a demo game (its names are made up, so x-8 is not renamed by it), a game on a
  // server OP.GG does not list, and a game outside the 30 days.
  await game("DEMO_1a2b3c4d_1", 2, [part("x-8", "Made Up#OCE")]);
  await game("OC1_0", 40, [part("x-9", "Old#OCE")]);
  await game("PBE1_7", 1, [part("x-10", "Tester#PBE")]);
}, 60_000);

afterAll(async () => {
  await handle.close();
});

describe("OP.GG link coverage for the data audit", () => {
  it("counts each place by where its link comes from, or why it has none", async () => {
    const report = await opggCoverage(handle.db, NOW);
    expect(report).toEqual({
      windowDays: 30,
      // 10 + 2 + the PBE place; the demo game and the older game are not counted.
      places: 13,
      removed: 1,
      teamMembers: 1,
      // The member by their linked account, x-1's older place by the newer Riot ID, the rest by their own.
      linked: { byLinkedAccount: 1, byNewerRiotId: 1, byRecordedRiotId: 3 },
      notLinked: { "no-name": 1, "no-tag": 2, "tag-length": 1, "tag-characters": 1, "name-length": 1, "name-characters": 0, server: 1 },
      recordedNamesNowAccepted: 1,
      renamedSinceGame: 1,
    });
    expect(JSON.stringify(report)).not.toMatch(/#|[mx]-\d/);
  });
});
