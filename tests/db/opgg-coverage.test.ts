import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";
import { eq, inArray } from "drizzle-orm";
import { matchDetails, riotAccounts, type MatchParticipantDetail } from "@/server/db/schema";
import { createPlayer, getOrCreateTeam } from "@/server/repositories/team";
import { addAccount } from "@/server/accounts/repository";
import { opggCoverage } from "@/server/players/riot-names";

/*
  The data audit's OP.GG link coverage (server/players/riot-names opggCoverage): of the places in
  the Riot games stored over the last 30 days, how many have a link and from which Riot ID (a
  linked account's, a newer game's or the game's own), and why the others have none, and what the
  tags outside 3–5 characters are. Counts only: nobody is named, and no tag is shown.
*/

const NOW = new Date("2026-10-20T10:00:00Z");
const DAY = 86_400_000;
let handle: DbHandle;

const game = (matchId: string, daysAgo: number, participants: MatchParticipantDetail[]) =>
  handle.db.insert(matchDetails).values({ matchId, platform: "oc1", queueId: 420, gameCreation: NOW.getTime() - daysAgo * DAY, gameDuration: 1800, gameVersion: "16.20.1", teams: [], participants });

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
      // x-3's two-letter tag, by server, length and kind.
      tagLengths: { "oc1 2 latin": 1 },
      // x-3 recorded the same tag in every game; no linked account's Riot ID has been confirmed by Riot yet.
      shortTags: { linkedAccountsCheckedByRiot: {}, players: { "oc1 2 latin": 1 }, recorded: { sameTagInEveryGame: 1, alsoLongerTagStartingWithIt: 0, alsoAnotherTag: 0 }, linkedAccount: { sameShortTag: 0, anotherTag: 0 }, distinctTags: 1, mostCommonTagPlayers: 1 },
      recordedNamesNowAccepted: 1,
      renamedSinceGame: 1,
    });
    expect(JSON.stringify(report)).not.toMatch(/#|[mx]-\d/);
  });

  it("tells a short tag Riot itself confirms from one cut off a longer tag or renamed, without showing any tag", async () => {
    const db = handle.db;
    const team = await getOrCreateTeam(db);
    const pal = await createPlayer(db, team.id, { displayName: "Pal", primaryRole: "TOP", primaryPool: [] });
    const lin = await createPlayer(db, team.id, { displayName: "Lin", primaryRole: "JUNGLE", primaryPool: [] });
    await addAccount(db, { ownerType: "player", playerId: pal.id, riotId: "Pal#UV", platform: "oc1", puuid: "s-1" });
    await addAccount(db, { ownerType: "player", playerId: lin.id, riotId: "Lin#OCE", platform: "oc1", puuid: "s-4" });
    // Riot's account record has confirmed these three Riot IDs (the identity check sets the time).
    await db.update(riotAccounts).set({ riotIdCheckedAt: NOW }).where(inArray(riotAccounts.puuid, ["m-1", "s-1", "s-4"]));
    // Pal as confirmed; "Cut#OC" before "Cut#OCE" (cut off); "Swap#AB" before "Swap#XYZ" (renamed,
    // and the same short tag as x-3); Lin recorded as "Lin#OC" while Riot's record says "OCE".
    await game("OC1_3", 4, [part("s-1", "Pal#UV"), part("s-2", "Cut#OC"), part("s-3", "Swap#AB"), part("s-4", "Lin#OC")]);
    await game("OC1_4", 3, [part("s-2", "Cut#OCE"), part("s-3", "Swap#XYZ")]);
    const report = await opggCoverage(db, NOW);
    expect(report.shortTags).toEqual({
      linkedAccountsCheckedByRiot: { "3-5": 2, "2 latin": 1 },
      // x-3, Pal, Cut, Swap and Lin.
      players: { "oc1 2 latin": 5 },
      recorded: { sameTagInEveryGame: 3, alsoLongerTagStartingWithIt: 1, alsoAnotherTag: 1 },
      linkedAccount: { sameShortTag: 1, anotherTag: 1 },
      // "ab" (x-3 and Swap), "uv" and "oc" (Cut and Lin).
      distinctTags: 3,
      mostCommonTagPlayers: 2,
    });
    expect(JSON.stringify(report)).not.toMatch(/#|[mxs]-\d|"(?:uv|ab|oc|oce|xyz)"/i);
    await db.delete(riotAccounts).where(inArray(riotAccounts.puuid, ["s-1", "s-4"]));
    await db.update(riotAccounts).set({ riotIdCheckedAt: null }).where(eq(riotAccounts.puuid, "m-1"));
  });
});
