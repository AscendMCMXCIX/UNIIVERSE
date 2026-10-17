import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";
import { accountMatches, matchDetails, riotAccounts, type MatchParticipantDetail } from "@/server/db/schema";
import { createPlayer, getOrCreateTeam } from "@/server/repositories/team";
import { getMatchGroups, invalidatePossibleGroupsCache } from "@/server/matches/possible-groups";
import { getMatchDetail } from "@/server/players/match-history";
import { FixtureStaticProvider } from "@/server/riot/static/fixture";
import { syncStaticData } from "@/server/riot/static/sync";

/*
  Possible groups from stored completed matches only (synthetic accounts and games, no Riot
  request): the analysed game, later games and games outside the window never count; players
  without a recorded Riot ID are left out; the browser gets scoreboard positions, never accounts.
*/

const DAY = 86_400_000;
const T = Date.UTC(2026, 9, 10);
let handle: DbHandle;
let playerId: string;

/** Ten players: blue keys first. `name: null` = no recorded Riot ID. */
function record(matchId: string, at: number, queueId: number, blue: string[], red: string[], names: Record<string, string | null> = {}) {
  const fill = (keys: string[], teamId: number) => [...keys, ...Array.from({ length: 5 - keys.length }, (_, i) => `${matchId}-${teamId}-${i}`)].map((puuid): MatchParticipantDetail => ({ puuid, name: puuid in names ? names[puuid]! : `${puuid}#OCE`, teamId, championId: "Ahri", championKey: 103, champLevel: 15, position: null, win: teamId === 100, kills: 3, deaths: 2, assists: 4, cs: 150, gold: 9000, damage: 12000, damageTaken: 15000, vision: 20, wardsPlaced: 8, items: null, spells: null, runes: null }));
  return { matchId, queueId, gameCreation: at, gameDuration: 1800, gameVersion: "16.20.1", teams: [{ teamId: 100, win: true, bans: [], objectives: {} }, { teamId: 200, win: false, bans: [], objectives: {} }], participants: [...fill(blue, 100), ...fill(red, 200)] };
}

beforeAll(async () => {
  handle = await testDb();
  const db = handle.db;
  await syncStaticData(db, new FixtureStaticProvider(), { fingerprint: false });
  const teamId = (await getOrCreateTeam(db)).id;
  playerId = (await createPlayer(db, teamId, { displayName: "Ace", primaryRole: "MID", primaryPool: ["Ahri"] })).id;
  const [a] = await db.insert(riotAccounts).values({ ownerType: "player", playerId, gameName: "Ace", tagLine: "OCE", platform: "oc1", puuid: "p-ace", label: "Ace" }).returning({ id: riotAccounts.id });
  const records = [
    // The analysed Solo/Duo game: Ace with a teammate, a hidden player, and an enemy pair.
    record("OC1_100", T, 420, ["p-ace", "p-friend", "p-hidden"], ["p-e1", "p-e2"], { "p-hidden": null }),
    // Earlier games: Ace and the friend on one team in OC1_1, 3 and 6; the enemy pair together in
    // all four (in OC1_2 on Ace's side, without the friend).
    record("OC1_1", T - 2 * DAY, 420, ["p-ace", "p-friend", "p-hidden"], ["p-e1", "p-e2"]),
    record("OC1_2", T - 9 * DAY, 400, ["p-ace", "p-e1", "p-e2"], []),
    record("OC1_3", T - 30 * DAY, 440, ["p-ace", "p-friend", "p-hidden"], ["p-e1", "p-e2"]),
    record("OC1_6", T - 60 * DAY, 420, ["p-ace", "p-friend"], ["p-e1", "p-e2"]),
    // Ace and the friend once more on one team, but after the analysed game: not "previous".
    record("OC1_4", T + DAY, 420, ["p-ace", "p-friend"], []),
    // Long before the window.
    record("OC1_5", T - 400 * DAY, 420, ["p-ace", "p-friend"], ["p-e1", "p-e2"]),
  ];
  await db.insert(matchDetails).values(records);
  await db.insert(accountMatches).values(records.map((r) => ({ accountId: a!.id, matchId: r.matchId, gameCreation: r.gameCreation, queueId: r.queueId, championId: "Ahri", role: "MID", win: true, patch: "16.20", gameDuration: 1800, kills: 3, deaths: 2, assists: 4, cs: 150, damage: 12000, visionScore: 20 })));
  invalidatePossibleGroupsCache();
}, 60_000);
afterAll(async () => {
  await handle.close();
});

describe("possible groups in a stored match", () => {
  it("groups players by earlier stored games on one team, within the window and before the match", async () => {
    const r = await getMatchGroups(handle.db, playerId, "OC1_100");
    if (r.status !== "ok") throw new Error(r.status);
    expect(r.windowDays).toBe(180);
    // OC1_1, 2, 3 and 6: earlier, inside the window, with at least one of this game's players.
    expect(r.gamesSearched).toBe(4);
    const blue = r.teams.find((t) => t.teamId === 100)!;
    const red = r.teams.find((t) => t.teamId === 200)!;
    // Ace (slot 0) and the friend (slot 1): OC1_1, OC1_3 and OC1_6; the hidden player (slot 2) is never grouped.
    expect(blue.groups).toEqual([{ slots: [0, 1], label: "Possible duo", games: 3, opposed: 0, evidence: [expect.objectContaining({ playedAt: T - 2 * DAY, queue: "Ranked Solo/Duo" }), expect.objectContaining({ queue: "Ranked Flex" }), expect.objectContaining({ playedAt: T - 60 * DAY })] }]);
    // The enemy pair (slots 5 and 6): together in all four earlier games, once on Ace's side.
    expect(red.groups).toEqual([expect.objectContaining({ slots: [5, 6], label: "Possible duo", games: 4, opposed: 0 })]);
    expect(red.groups[0]!.evidence.map((e) => e.win)).toEqual([false, true, false, false]);
  });

  it("sends scoreboard positions, never accounts or names from other games", async () => {
    const r = await getMatchGroups(handle.db, playerId, "OC1_100");
    const text = JSON.stringify(r);
    expect(text).not.toMatch(/p-ace|p-friend|p-e1|OC1_[0-9]|#OCE/);
    const detail = await getMatchDetail(handle.db, playerId, "OC1_100", { viewerIsOwner: true });
    if (detail.status !== "ok") throw new Error(detail.status);
    // The scoreboard's own positions line up with the groups' slots.
    const bySlot = new Map(detail.view.teams.flatMap((t) => t.participants.map((p) => [p.slot, p.name])));
    expect([bySlot.get(0), bySlot.get(1), bySlot.get(5), bySlot.get(6)]).toEqual(["p-ace#OCE", "p-friend#OCE", "p-e1#OCE", "p-e2#OCE"]);
  });

  it("answers only for a match in the player's own history", async () => {
    expect((await getMatchGroups(handle.db, playerId, "OC1_999")).status).toBe("not-found");
    const other = (await createPlayer(handle.db, (await getOrCreateTeam(handle.db)).id, { displayName: "Bea", primaryRole: "TOP", primaryPool: ["Ahri"] })).id;
    expect((await getMatchGroups(handle.db, other, "OC1_100")).status).toBe("not-found");
  });
});
