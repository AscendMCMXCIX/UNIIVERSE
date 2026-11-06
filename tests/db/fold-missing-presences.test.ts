import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";
import { accountChampionHistory, accountMatches, matchDetails, riotAccounts, type MatchParticipantDetail } from "@/server/db/schema";
import { FixtureStaticProvider } from "@/server/riot/static/fixture";
import { syncStaticData } from "@/server/riot/static/sync";
import { createPlayer, getOrCreateTeam } from "@/server/repositories/team";
import { foldMissingPresences } from "@/server/accounts/sync";
import { runJob } from "@/server/jobs";
import fixture from "@/server/riot/fixtures/champions.fixture.json";

/*
  A game a teammate's collection stored that an account's own list never did (data-audit's "places
  missing from own history") is folded into that account's history from the stored record by the
  daily housekeeping, the way the sync folds a listed game another account already stored: the same
  row, champion history and figures; a remake remembered without a champion; nothing for a game the
  account did not play; nothing twice; a bounded batch a run; no request to Riot.
*/

const keyOf = (id: string) => fixture.champions.find((c) => c.id === id)!.key;
const DAY = 86_400_000;
const NOW = new Date(Date.UTC(2026, 10, 4, 12));
const part = (puuid: string, teamId: number, champion: string, over: Partial<MatchParticipantDetail> = {}): MatchParticipantDetail => ({ puuid, name: null, teamId, championId: champion, championKey: keyOf(champion), champLevel: 15, position: "MIDDLE", win: teamId === 100, kills: 3, deaths: 2, assists: 4, cs: 150, gold: 9000, damage: 12000, damageTaken: 15000, vision: 20, wardsPlaced: 8, items: null, spells: null, runes: null, ...over });

let handle: DbHandle;
const acc: Record<string, string> = {};

beforeAll(async () => {
  handle = await testDb();
  const db = handle.db;
  await syncStaticData(db, new FixtureStaticProvider(), { fingerprint: false });
  const teamId = (await getOrCreateTeam(db)).id;
  for (const [name, key] of [["Ace", "ace"], ["Bea", "bea"]] as const) {
    const player = await createPlayer(db, teamId, { displayName: name, primaryRole: "MID", primaryPool: ["Ahri"] });
    const [row] = await db.insert(riotAccounts).values({ ownerType: "player", playerId: player.id, gameName: key, tagLine: "T", platform: "oc1", puuid: `p-${key}`, label: "main" }).returning({ id: riotAccounts.id });
    acc[key] = row!.id;
  }
  const at = (days: number) => NOW.getTime() - days * DAY;
  const record = (matchId: string, days: number, participants: MatchParticipantDetail[], over: Partial<typeof matchDetails.$inferInsert> = {}) => ({ matchId, platform: "oc1", queueId: 400, gameCreation: at(days), gameDuration: 1800, gameVersion: "16.20.1.1", teams: [], participants, ...over });
  // Ace's history holds every game the records name him in, as his own collection stored them:
  // G1 and G3 folded, G2 remembered without a champion (a remake). The records name Bea too,
  // and her history has none of them.
  await db.insert(accountMatches).values([
    { accountId: acc.ace!, matchId: "OC1_1", gameCreation: at(5), queueId: 400, championId: "Ahri", role: "MIDDLE", win: true, patch: "16.20", gameDuration: 1800, kills: 3, deaths: 2, assists: 4 },
    { accountId: acc.ace!, matchId: "OC1_2", gameCreation: at(4), queueId: 400 },
    { accountId: acc.ace!, matchId: "OC1_3", gameCreation: at(3), queueId: 400, championId: "Ahri", role: "MIDDLE", win: true, patch: "16.20", gameDuration: 1800, kills: 3, deaths: 2, assists: 4 },
  ]);
  await db.insert(matchDetails).values([
    record("OC1_1", 5, [part("p-ace", 100, "Ahri"), part("p-bea", 100, "Gwen", { position: "TOP", kills: 7, deaths: 1, assists: 2 }), part("s1", 200, "Ahri"), part("s2", 200, "Ahri")]),
    // G2: a remake naming Bea: remembered without a champion, as the sync does.
    record("OC1_2", 4, [part("p-ace", 100, "Ahri"), part("p-bea", 100, "Gwen", { position: "TOP" })], { gameDuration: 200 }),
    // G3: Bea erased from the record (a removed player), not hers to fold.
    record("OC1_3", 3, [part("p-ace", 100, "Ahri"), part("", 100, "Gwen", { removed: true } as Partial<MatchParticipantDetail>)]),
    // G4: a game of two strangers only.
    record("OC1_4", 2, [part("s3", 100, "Ahri"), part("s4", 200, "Ahri")]),
  ]);
}, 60_000);
afterAll(async () => {
  await handle.close();
});

const beaRows = async () => handle.db.select({ matchId: accountMatches.matchId, championId: accountMatches.championId, role: accountMatches.role, win: accountMatches.win, kills: accountMatches.kills, deaths: accountMatches.deaths, assists: accountMatches.assists, teamId: accountMatches.teamId }).from(accountMatches).where(eq(accountMatches.accountId, acc.bea!)).orderBy(accountMatches.matchId);

describe("folding a member's missing places from the stored records", () => {
  it("folds the game as the sync would, remembers the remake, leaves the rest, and does nothing twice", async () => {
    const db = handle.db;
    const first = await foldMissingPresences(db, { now: NOW });
    expect(first).toEqual({ accounts: 2, candidates: 2, folded: 1, skipped: 1, later: 0 });
    const rows = await beaRows();
    expect(rows).toEqual([
      { matchId: "OC1_1", championId: "Gwen", role: "TOP", win: true, kills: 7, deaths: 1, assists: 2, teamId: 100 },
      { matchId: "OC1_2", championId: null, role: null, win: null, kills: null, deaths: null, assists: null, teamId: null },
    ]);
    const [history] = await db.select({ games: accountChampionHistory.games, wins: accountChampionHistory.wins }).from(accountChampionHistory).where(and(eq(accountChampionHistory.accountId, acc.bea!), eq(accountChampionHistory.championId, "Gwen")));
    expect(history).toEqual({ games: 1, wins: 1 });
    // Ace's history is untouched: he had every game the records name him in.
    expect((await db.select({ matchId: accountMatches.matchId }).from(accountMatches).where(eq(accountMatches.accountId, acc.ace!)).orderBy(accountMatches.matchId)).map((r) => r.matchId)).toEqual(["OC1_1", "OC1_2", "OC1_3"]);
    // Nothing is left to fold, and nothing is folded twice.
    expect(await foldMissingPresences(db, { now: NOW })).toEqual({ accounts: 2, candidates: 0, folded: 0, skipped: 0, later: 0 });
    expect((await beaRows()).length).toBe(2);
    expect(history).toEqual({ games: 1, wins: 1 });
  });

  it("is bounded per run, newest game first, and the housekeeping job reports it", async () => {
    const db = handle.db;
    const at = (days: number) => NOW.getTime() - days * DAY;
    await db.insert(matchDetails).values([
      { matchId: "OC1_5", platform: "oc1", queueId: 420, gameCreation: at(1), gameDuration: 1700, gameVersion: "16.20.1.1", teams: [], participants: [part("p-bea", 200, "Gwen", { position: "TOP", win: false })] },
      { matchId: "OC1_6", platform: "oc1", queueId: 420, gameCreation: at(9), gameDuration: 1700, gameVersion: "16.20.1.1", teams: [], participants: [part("p-bea", 100, "Gwen", { position: "TOP" })] },
    ]);
    expect(await foldMissingPresences(db, { now: NOW, limit: 1 })).toEqual({ accounts: 2, candidates: 1, folded: 1, skipped: 0, later: 0 });
    expect((await beaRows()).map((r) => r.matchId)).toEqual(["OC1_1", "OC1_2", "OC1_5"]);
    const result = await runJob(db, "integrity", "test");
    expect(result.ok).toBe(true);
    expect((result.summary as { missingPresences: unknown }).missingPresences).toEqual({ accounts: 2, candidates: 1, folded: 1, skipped: 0, later: 0 });
    expect((await beaRows()).map((r) => r.matchId)).toEqual(["OC1_1", "OC1_2", "OC1_5", "OC1_6"]);
  });
});
