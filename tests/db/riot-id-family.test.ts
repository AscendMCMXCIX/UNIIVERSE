import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";
import { accountMatches, matchDetails, riotAccounts, type MatchParticipantDetail } from "@/server/db/schema";
import { createPlayer, getOrCreateTeam } from "@/server/repositories/team";
import { riotIdFamily } from "@/server/riot/id-family";
import { FixtureStaticProvider } from "@/server/riot/static/fixture";
import { syncStaticData } from "@/server/riot/static/sync";

/*
  Which stored games carry the members' current Riot ids: a game stored under another key holds
  another id at the member's place (Riot encrypts ids per registered application).
*/

let handle: DbHandle;
const NOW = new Date(Date.UTC(2026, 10, 2, 12, 0));
const DAY = 86_400_000;
const part = (puuid: string, teamId: number, championId: string, extra: Partial<MatchParticipantDetail> = {}): MatchParticipantDetail => ({ puuid, name: null, teamId, championId, championKey: 0, champLevel: 15, position: null, win: teamId === 100, kills: 3, deaths: 2, assists: 4, cs: 150, gold: 9000, damage: 12000, damageTaken: 15000, vision: 20, wardsPlaced: 8, items: null, spells: null, runes: null, ...extra });

beforeAll(async () => {
  handle = await testDb();
  const db = handle.db;
  await syncStaticData(db, new FixtureStaticProvider(), { fingerprint: false });
  const teamId = (await getOrCreateTeam(db)).id;
  const mid = (await createPlayer(db, teamId, { displayName: "Mid", primaryRole: "MID", primaryPool: ["Ahri"] })).id;
  const top = (await createPlayer(db, teamId, { displayName: "Top", primaryRole: "TOP", primaryPool: ["Ornn"] })).id;
  const [a] = await db.insert(riotAccounts).values({ ownerType: "player", playerId: mid, gameName: "Mid", tagLine: "OCE", platform: "oc1", puuid: "id-now", label: "Mid" }).returning({ id: riotAccounts.id });
  // Not resolved under the current key yet: its games say nothing about the key.
  const [b] = await db.insert(riotAccounts).values({ ownerType: "player", playerId: top, gameName: "Top", tagLine: "OCE", platform: "oc1", puuid: null, label: "Top" }).returning({ id: riotAccounts.id });
  const game = (matchId: string, ageDays: number, storedAt: Date, participants: MatchParticipantDetail[], teamId: number | null, account = a!.id, championId = "Ahri") => ({
    row: { accountId: account, matchId, gameCreation: NOW.getTime() - ageDays * DAY, queueId: 420, championId, role: "MID", win: true, patch: "16.20", gameDuration: 1900, teamId },
    details: { matchId, gameCreation: NOW.getTime() - ageDays * DAY, gameDuration: 1900, teams: [], participants, storedAt },
  });
  const games = [
    // Stored under the key in use: the member's own entry carries its current id.
    game("OC1_1", 2, new Date("2026-10-31T10:00:00Z"), [part("id-now", 100, "Ahri"), part("someone", 200, "Zed")], 100),
    game("OC1_2", 45, new Date("2026-10-31T10:00:00Z"), [part("id-now", 200, "Ahri"), part("someone", 100, "Zed")], 200),
    // Stored under another key: another id at the member's place, found with or without the side.
    game("OC1_3", 200, new Date("2026-10-07T09:00:00Z"), [part("id-before", 100, "Ahri"), part("other-before", 200, "Zed")], 100),
    game("OC1_4", 400, new Date("2026-10-08T09:00:00Z"), [part("other-before", 100, "Zed"), part("id-before", 200, "Ahri")], null),
    // No entry for the member's champion: neither.
    game("OC1_5", 60, new Date("2026-10-31T10:00:00Z"), [part("someone", 100, "Zed")], 100),
    // The member's place belongs to an erased player: not counted as another key.
    game("OC1_6", 10, new Date("2026-10-31T10:00:00Z"), [part("removed-1", 100, "Ahri", { removed: true })], 100),
    // An unresolved account's game is left out.
    game("OC1_7", 3, new Date("2026-10-31T10:00:00Z"), [part("whoever", 100, "Ornn")], 100, b!.id, "Ornn"),
  ];
  await db.insert(accountMatches).values(games.map((g) => g.row));
  await db.insert(matchDetails).values(games.map((g) => g.details));
});
afterAll(async () => {
  await handle.close();
});

describe("which stored games carry the members' current Riot ids", () => {
  it("counts the member's place by the game's age: its current id, another id, or no entry", async () => {
    const r = await riotIdFamily(handle.db, NOW);
    expect(r.byAge).toEqual([
      { age: "last 30 days", places: 2, currentId: 1, anotherId: 0, notFound: 1 },
      { age: "30-90 days", places: 2, currentId: 1, anotherId: 0, notFound: 1 },
      { age: "90-365 days", places: 1, currentId: 0, anotherId: 1, notFound: 0 },
      { age: "older", places: 1, currentId: 0, anotherId: 1, notFound: 0 },
    ]);
  });

  it("says when the games with another id were stored, and that they need re-keying", async () => {
    const r = await riotIdFamily(handle.db, NOW);
    expect(r.anotherIdByStoredWeek).toEqual([{ week: "2026-10-05", places: 2 }]);
    expect(r.verdict).toMatch(/^2 of 6 member places, in games stored in the weeks of 2026-10-05 to 2026-10-05, carry another id/);
  });

  it("reports nothing to re-key when every game carries the current ids", async () => {
    const fresh = await testDb();
    try {
      const db = fresh.db;
      expect((await riotIdFamily(db, NOW)).verdict).toBe("No stored game has a linked account's entry yet.");
      await syncStaticData(db, new FixtureStaticProvider(), { fingerprint: false });
      const teamId = (await getOrCreateTeam(db)).id;
      const jg = (await createPlayer(db, teamId, { displayName: "Jg", primaryRole: "JUNGLE", primaryPool: ["Vi"] })).id;
      const [a] = await db.insert(riotAccounts).values({ ownerType: "player", playerId: jg, gameName: "Jg", tagLine: "OCE", platform: "oc1", puuid: "jg-now", label: "Jg" }).returning({ id: riotAccounts.id });
      await db.insert(accountMatches).values({ accountId: a!.id, matchId: "OC1_9", gameCreation: NOW.getTime() - 500 * DAY, queueId: 420, championId: "Vi", role: "JUNGLE", win: true, patch: "15.1", gameDuration: 1800, teamId: 200 });
      await db.insert(matchDetails).values({ matchId: "OC1_9", gameCreation: NOW.getTime() - 500 * DAY, gameDuration: 1800, teams: [], participants: [part("jg-now", 200, "Vi")] });
      const r = await riotIdFamily(db, NOW);
      expect(r.byAge).toEqual([{ age: "older", places: 1, currentId: 1, anotherId: 0, notFound: 0 }]);
      expect(r.anotherIdByStoredWeek).toEqual([]);
      expect(r.verdict).toMatch(/^Every stored game carries the members' current ids/);
    } finally {
      await fresh.close();
    }
  });
});
