import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";
import { accountMatches, matchDetails, riotAccounts, type MatchParticipantDetail } from "@/server/db/schema";
import { createPlayer, getOrCreateTeam, setTeamMember } from "@/server/repositories/team";
import { invalidateTeamInsightsCache, loadTeamInsights, readInsightInputs, teamInsightsAudit } from "@/server/matches/team-insights";
import { FixtureStaticProvider } from "@/server/riot/static/fixture";
import { syncStaticData } from "@/server/riot/static/sync";

/*
  Team insights from stored histories and records (synthetic accounts and games, no Riot request):
  who was in each game is read from the stored record, so a teammate whose own history lacks the
  game is still found; personal-use and erased players are never members; remakes, other seasons,
  games without a record and a person's accounts on both sides are left out and counted; the
  result is cached until the history changes.
*/

const NOW = new Date(Date.UTC(2026, 10, 4, 12));
const DAY = 86_400_000;
let handle: DbHandle;
let teamId: string;
const ids: Record<string, string> = {};
const acc: Record<string, string> = {};
const part = (puuid: string, teamId: number, extra: Partial<MatchParticipantDetail> = {}): MatchParticipantDetail => ({ puuid, name: null, teamId, championId: null, championKey: 0, champLevel: 15, position: null, win: teamId === 100, kills: 3, deaths: 2, assists: 4, cs: 150, gold: 9000, damage: 12000, damageTaken: 15000, vision: 20, wardsPlaced: 8, items: null, spells: null, runes: null, ...extra });
const stranger = (i: number, teamId: number) => part(`stranger-${i}`, teamId);

beforeAll(async () => {
  handle = await testDb();
  const db = handle.db;
  await syncStaticData(db, new FixtureStaticProvider(), { fingerprint: false });
  teamId = (await getOrCreateTeam(db)).id;
  for (const [name, role, champ] of [["Ace", "TOP", "Riven"], ["Bea", "JUNGLE", "Viego"], ["Cy", "MID", "Ahri"], ["Solo", "ADC", "Jinx"]] as const) {
    ids[name] = (await createPlayer(db, teamId, { displayName: name, primaryRole: role, primaryPool: [champ] })).id;
  }
  await setTeamMember(db, teamId, ids.Solo!, false); // personal use: never a member
  const account = async (key: string, player: string) => {
    const [r] = await db.insert(riotAccounts).values({ ownerType: "player", playerId: ids[player]!, gameName: key, tagLine: "T", platform: "oc1", puuid: `p-${key}`, label: key }).returning({ id: riotAccounts.id });
    acc[key] = r!.id;
  };
  await account("ace", "Ace");
  await account("ace2", "Ace");
  await account("bea", "Bea");
  await account("cy", "Cy");
  await account("solo", "Solo");
  const at = (days: number) => NOW.getTime() - days * DAY;
  const game = (key: string, matchId: string, days: number, over: Partial<typeof accountMatches.$inferInsert> = {}) => ({ accountId: acc[key]!, matchId, gameCreation: at(days), queueId: 400, championId: "Ahri", role: "TOP", win: true, patch: "16.20", gameDuration: 1800, kills: 4, deaths: 2, assists: 6, cs: 180, damage: 20000, visionScore: 20, ...over });
  await db.insert(accountMatches).values([
    // G1: Ace and Bea on blue, Cy on red.
    game("ace", "OC1_1", 3),
    game("bea", "OC1_1", 3, { role: "JUNGLE" }),
    game("cy", "OC1_1", 3, { win: false, role: "MID" }),
    // G2: Bea with strangers only.
    game("bea", "OC1_2", 4, { role: "JUNGLE", win: false }),
    // G3: Ace with the personal-use account: no teammate.
    game("ace", "OC1_3", 5),
    game("solo", "OC1_3", 5),
    // G4: Ace and Bea on blue, but the game is not in Bea's own history: found from the record.
    game("ace", "OC1_4", 6),
    // G5: no record stored.
    game("ace", "OC1_5", 7),
    // G6: a remake (stored without a champion, as the sync stores it).
    { ...game("ace", "OC1_6", 8), championId: null, gameDuration: 200 },
    // G7: last season.
    game("ace", "OC1_7", 320, { patch: "15.24" }),
    // G8: Ace's two accounts against each other.
    game("ace", "OC1_8", 9),
    game("ace2", "OC1_8", 9, { win: false }),
    // G9: Cy with an erased player (PUUID removed) and a record whose ids are malformed.
    game("cy", "OC1_9", 10, { role: "MID" }),
  ]);
  const detail = (matchId: string, participants: MatchParticipantDetail[]) => ({ matchId, gameCreation: 1, gameDuration: 1800, teams: [], participants });
  await db.insert(matchDetails).values([
    detail("OC1_1", [part("p-ace", 100), part("p-bea", 100), stranger(1, 100), stranger(2, 100), stranger(3, 100), part("p-cy", 200), stranger(4, 200), stranger(5, 200), stranger(6, 200), stranger(7, 200)]),
    detail("OC1_2", [part("p-bea", 200), stranger(8, 200), stranger(9, 100)]),
    detail("OC1_3", [part("p-ace", 100), part("p-solo", 100), stranger(10, 200)]),
    detail("OC1_4", [part("p-ace", 100), part("p-bea", 100), stranger(11, 200)]),
    detail("OC1_7", [part("p-ace", 100), stranger(12, 200)]),
    detail("OC1_8", [part("p-ace", 100), part("p-ace2", 200)]),
    detail("OC1_9", [part("p-cy", 100), part("", 100, { removed: true }), { ...stranger(13, 200), teamId: "x" as unknown as number }]),
  ]);
  invalidateTeamInsightsCache();
}, 60_000);
afterAll(async () => {
  await handle.close();
});

describe("team insights from stored games", () => {
  it("reads only the members' places from the records", async () => {
    const accounts = Object.entries(acc)
      .filter(([k]) => k !== "solo")
      .map(([k, id]) => ({ id, playerId: k.startsWith("ace") ? ids.Ace! : k === "bea" ? ids.Bea! : ids.Cy! }));
    const { games, presences } = await readInsightInputs(handle.db, accounts, 16);
    // One row per member per game (Ace's two accounts in G8 are one), the remake never read, last
    // season's game read (the domain leaves it out by its patch): Ace 6, Bea 2, Cy 2.
    expect(games).toHaveLength(10);
    expect(games.some((g) => g.durationS === 200)).toBe(false);
    expect(games.filter((g) => g.playerId === ids.Ace).length).toBe(6);
    // Matches travel as small numbers, never as Riot match ids.
    expect(games.every((g) => /^\d+$/.test(g.matchId))).toBe(true);
    // Places: G1 ×3, G2, G3, G4 ×2, G7, G8 ×2, G9 — never a stranger's, the erased player's or the personal-use account's.
    expect(presences).toHaveLength(11);
    expect(presences.every((p) => [ids.Ace, ids.Bea, ids.Cy].includes(p.playerId) && (p.teamId === 100 || p.teamId === 200))).toBe(true);
  });

  it("finds teammates from the record, and counts what it leaves out", async () => {
    const view = await loadTeamInsights(handle.db, teamId, NOW);
    const r = view.insights;
    expect(r.season).toBe(16);
    expect(view.names[ids.Ace!]).toBe("Ace");
    expect(view.names[ids.Solo!]).toBeUndefined();
    // Ace: G1 (with Bea, but Cy against them: members on both sides, left out of every comparison),
    // G3 (alone: Solo is not a member), G4 (with Bea, from the record).
    // Bea: G1 (with Ace), G2 (alone), G4 is not in her history. Cy: G1 (against members), G9 (alone).
    expect(r.memberGames).toBe(7);
    expect(r.excluded).toEqual({ ineligible: 1, unknownSide: 1, bothSides: 1 });
    const ace = r.comparisons.find((c) => c.id === `with-team:${ids.Ace}`)!;
    expect(ace.result.exposed.games).toBe(1);
    expect(ace.result.other.games).toBe(1);
    const cy = r.comparisons.find((c) => c.id === `with-team:${ids.Cy}`)!;
    // G1 had members on the other side: neither with teammates nor alone. G9 was alone.
    expect(cy.result.exposed.games + cy.result.other.games).toBe(1);
    // Ace and Bea's side of G4 (G1 had members on both sides): one team game.
    expect(r.teamGames).toBe(1);
    // Far too few games to test anything.
    expect(r.tested).toBe(0);
    expect(r.findings).toEqual([]);
  });

  it("reports to data-audit with anonymous labels and counts only, including places missing from members' own histories", async () => {
    const labels = new Map<string, string>();
    const labelOf = (id: string) => labels.get(id) ?? (labels.set(id, `p${labels.size + 1}`), labels.get(id)!);
    const audit = await teamInsightsAudit(handle.db, teamId, labelOf, NOW);
    expect(audit.memberGames).toBe(7);
    expect(audit.tested).toBe(0);
    // Bea's place in G4 is in the record but not in her history: no row at all, for a game older
    // than her earliest stored game, in a collected queue, with her season history not yet complete.
    expect(audit.placesMissingFromOwnHistory).toEqual({
      places: 1,
      matches: 1,
      members: 1,
      thisSeason: 1,
      byReason: { noRow: { places: 1, beforeSeasonStart: 0, beforeOwnFirstGame: 1, queueNotCollected: 0, historyIncomplete: 1 }, row: { places: 0, refusedForGood: 0, remake: 0, otherQueue: 0, championUnknown: 0, withChampion: 0 } },
      byQueue: { "400": 1 },
    });
    const text = JSON.stringify(audit);
    for (const secret of ["Ace", "Bea", "Cy", "p-ace", "p-bea", "OC1_", ...Object.values(ids)]) expect(text).not.toContain(secret);
    expect(audit.comparisons.every((c) => c.member === null || /^p\d+$/.test(c.member))).toBe(true);
  });

  it("tells a place with no row from one whose row has no champion, and says what kind of row it is", async () => {
    const labelOf = (id: string) => id.slice(0, 2);
    const reasons = async () => (await teamInsightsAudit(handle.db, teamId, labelOf, NOW)).placesMissingFromOwnHistory;
    const stub = (over: Partial<typeof accountMatches.$inferInsert>) => ({ accountId: acc.bea!, matchId: "OC1_4", gameCreation: NOW.getTime() - 6 * DAY, queueId: 400, championId: null, gameDuration: 1800, ...over });
    // A row Riot refused for good (no start time), as the sync records it.
    await handle.db.insert(accountMatches).values(stub({ gameCreation: 0 }));
    expect((await reasons()).byReason).toMatchObject({ noRow: { places: 0 }, row: { places: 1, refusedForGood: 1, remake: 0, otherQueue: 0, championUnknown: 0, withChampion: 0 } });
    await handle.db.delete(accountMatches).where(and(eq(accountMatches.accountId, acc.bea!), eq(accountMatches.matchId, "OC1_4")));
    // A remake's row.
    await handle.db.insert(accountMatches).values(stub({ gameDuration: 200 }));
    expect((await reasons()).byReason.row).toMatchObject({ places: 1, remake: 1, refusedForGood: 0 });
    await handle.db.delete(accountMatches).where(and(eq(accountMatches.accountId, acc.bea!), eq(accountMatches.matchId, "OC1_4")));
    // A queue the sync does not count.
    await handle.db.insert(accountMatches).values(stub({ queueId: 450 }));
    expect((await reasons()).byReason.row).toMatchObject({ places: 1, otherQueue: 1 });
    await handle.db.delete(accountMatches).where(and(eq(accountMatches.accountId, acc.bea!), eq(accountMatches.matchId, "OC1_4")));
    // A champion the list did not have.
    await handle.db.insert(accountMatches).values(stub({}));
    expect((await reasons()).byReason.row).toMatchObject({ places: 1, championUnknown: 1 });
    await handle.db.delete(accountMatches).where(and(eq(accountMatches.accountId, acc.bea!), eq(accountMatches.matchId, "OC1_4")));
    // Her season complete: the same missing place no longer counts as an unfinished history.
    await handle.db.update(riotAccounts).set({ historyBackfill: { season: 16, queues: {}, startedAt: NOW.toISOString(), completedAt: NOW.toISOString() } }).where(eq(riotAccounts.id, acc.bea!));
    expect((await reasons()).byReason.noRow).toEqual({ places: 1, beforeSeasonStart: 0, beforeOwnFirstGame: 1, queueNotCollected: 0, historyIncomplete: 0 });
    await handle.db.update(riotAccounts).set({ historyBackfill: null }).where(eq(riotAccounts.id, acc.bea!));
    // A game of last December, inside the month the insights read before the season's start:
    // Ace's longer history holds it, Bea's season list never named it. Not a gap in this season.
    const december = Date.UTC(2025, 11, 15, 12);
    await handle.db.insert(accountMatches).values({ accountId: acc.ace!, matchId: "OC1_12", gameCreation: december, queueId: 420, championId: "Ahri", role: "TOP", win: true, patch: "15.24", gameDuration: 1800 });
    await handle.db.insert(matchDetails).values({ matchId: "OC1_12", gameCreation: december, gameDuration: 1800, teams: [], participants: [part("p-ace", 100), part("p-bea", 100), stranger(14, 200)] });
    const withDecember = await reasons();
    expect(withDecember).toMatchObject({ places: 2, thisSeason: 1, byReason: { noRow: { places: 2, beforeSeasonStart: 1, beforeOwnFirstGame: 2 } }, byQueue: { "400": 1, "420": 1 } });
    await handle.db.delete(accountMatches).where(eq(accountMatches.matchId, "OC1_12"));
    await handle.db.delete(matchDetails).where(eq(matchDetails.matchId, "OC1_12"));
  });

  it("is cached until the history changes", async () => {
    const first = await loadTeamInsights(handle.db, teamId, NOW);
    const again = await loadTeamInsights(handle.db, teamId, NOW);
    expect(again.computedAt).toBe(first.computedAt);
    await handle.db.insert(accountMatches).values({ accountId: acc.bea!, matchId: "OC1_10", gameCreation: NOW.getTime() - DAY, queueId: 400, championId: "Viego", role: "JUNGLE", win: true, patch: "16.21", gameDuration: 1700 });
    await handle.db.insert(matchDetails).values({ matchId: "OC1_10", gameCreation: 1, gameDuration: 1700, teams: [], participants: [part("p-bea", 100)] });
    const later = new Date(NOW.getTime() + 1000);
    const after = await loadTeamInsights(handle.db, teamId, later);
    expect(after.computedAt).toBe(later.getTime());
    expect(after.insights.memberGames).toBe(8);
  });

  it("follows membership changes at once", async () => {
    await setTeamMember(handle.db, teamId, ids.Bea!, false);
    try {
      const view = await loadTeamInsights(handle.db, teamId, NOW);
      expect(view.names[ids.Bea!]).toBeUndefined();
      // Without Bea as a member, Ace's G4 is a game alone (as G3 was); G1 still had Cy against him.
      const ace = view.insights.comparisons.find((c) => c.id === `with-team:${ids.Ace}`)!;
      expect(ace.result.exposed.games).toBe(0);
      expect(ace.result.other.games).toBe(2);
      expect(view.insights.comparisons.some((c) => c.playerId === ids.Bea || c.teammateId === ids.Bea)).toBe(false);
    } finally {
      await setTeamMember(handle.db, teamId, ids.Bea!, true);
    }
  });

  it("keeps working after a Riot key change gives every account new PUUIDs the stored records do not carry", async () => {
    // The sides were copied onto the members' stored games when they were summarised (the first load did that).
    const before = await loadTeamInsights(handle.db, teamId, NOW);
    for (const [k, id] of Object.entries(acc)) await handle.db.update(riotAccounts).set({ puuid: `new-key-${k}` }).where(eq(riotAccounts.id, id));
    try {
      invalidateTeamInsightsCache();
      const after = await loadTeamInsights(handle.db, teamId, NOW);
      // Games found only through a record (Bea's G4) are lost until the records are refetched; every
      // member's own game keeps its side, so nothing else changes.
      expect(after.insights.memberGames).toBe(before.insights.memberGames);
      expect(after.insights.teamGames).toBe(before.insights.teamGames - 1);
      expect(after.insights.excluded.unknownSide).toBe(before.insights.excluded.unknownSide);
    } finally {
      for (const [k, id] of Object.entries(acc)) await handle.db.update(riotAccounts).set({ puuid: `p-${k}` }).where(eq(riotAccounts.id, id));
      invalidateTeamInsightsCache();
    }
  });

  it("answers with nothing to compare for a team without linked accounts", async () => {
    await handle.db.update(riotAccounts).set({ puuid: null }).where(eq(riotAccounts.ownerType, "player"));
    try {
      invalidateTeamInsightsCache();
      const view = await loadTeamInsights(handle.db, teamId, NOW);
      expect(view.insights.memberGames).toBe(0);
      expect(view.insights.comparisons).toEqual([]);
      expect(view.insights.typicalMargin).toBeNull();
    } finally {
      for (const [k, id] of Object.entries(acc)) await handle.db.update(riotAccounts).set({ puuid: `p-${k}` }).where(eq(riotAccounts.id, id));
    }
  });
});
