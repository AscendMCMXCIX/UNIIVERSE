import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";
import { accountMatches, matchDetails, riotAccounts, type MatchParticipantDetail } from "@/server/db/schema";
import { createPlayer, getOrCreateTeam, setTeamMember } from "@/server/repositories/team";
import { invalidateTeamInsightsCache, loadTeamInsights, readInsightInputs } from "@/server/matches/team-insights";
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
    // The remake is never read; last season's game is read (the domain leaves it out by patch).
    expect(games.some((g) => g.matchId === "OC1_6")).toBe(false);
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
    // Ace: G1 (with Bea), G3 (alone: Solo is not a member), G4 (with Bea, from the record).
    // Bea: G1 (with Ace), G2 (alone), G4 is not in her history. Cy: G1 (against members), G9 (alone).
    expect(r.memberGames).toBe(7);
    expect(r.excluded).toEqual({ ineligible: 1, noRecord: 1, bothSides: 1 });
    const ace = r.comparisons.find((c) => c.id === `with-team:${ids.Ace}`)!;
    expect(ace.result.exposed.games).toBe(2);
    expect(ace.result.other.games).toBe(1);
    const cy = r.comparisons.find((c) => c.id === `with-team:${ids.Cy}`)!;
    // G1 had members only on the other side: neither with teammates nor alone.
    expect(cy.result.exposed.games + cy.result.other.games).toBe(1);
    // Ace and Bea's sides of G1 and G4: two team games.
    expect(r.teamGames).toBe(2);
    // Far too few games to test anything.
    expect(r.tested).toBe(0);
    expect(r.findings).toEqual([]);
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
