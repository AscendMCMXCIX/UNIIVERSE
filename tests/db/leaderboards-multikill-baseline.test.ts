import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";
import { accountMatches, matchDetails, riotAccounts, type MatchParticipantDetail } from "@/server/db/schema";
import { currentSeason } from "@/server/accounts/sync";
import { createPlayer, getOrCreateTeam } from "@/server/repositories/team";
import { invalidateLeaderboardCache, loadLeaderboardData } from "@/server/leaderboards/service";
import { invalidateMultikillBaselineCache, loadMultikillBaseline } from "@/server/leaderboards/multikill-baseline";
import { invalidateMultikillCountingCache, loadCountingReading } from "@/server/accounts/multikill-counting";
import { getPlayerOverview } from "@/server/players/overview";
import { getPlayer } from "@/server/repositories/team";
import { buildLeaderboardsView, recordsSeason } from "@/server/leaderboards/recent-view";
import { FixtureStaticProvider } from "@/server/riot/static/fixture";
import { syncStaticData } from "@/server/riot/static/sync";

/*
  The multikill score's comparison on stored records (server/leaderboards/multikill-baseline): every
  other participant of the members' season games, as aggregates only. Synthetic records: each game
  has the member (Ash or Bo, both team members, Bo sometimes in Ash's game as an ally), eight other
  players with Riot's positions and counters, and a removed player. Nested counters (a triple also
  counts a double), as Riot's are believed to count; the reading comes from the records themselves.
*/

let handle: DbHandle;
let teamId: string;
let season: number;
const id: Record<string, string> = {};
const NOW = Date.UTC(2026, 10, 2, 12);
const POSITIONS = ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"] as const;
const GAMES = 140;

const part = (puuid: string, teamId: number, position: string, championId: string, stats: MatchParticipantDetail["stats"], extra: Partial<MatchParticipantDetail> = {}): MatchParticipantDetail => ({ puuid, name: `${puuid}#X`, teamId, championId, championKey: 1, champLevel: 15, position, win: teamId === 100, kills: 5, deaths: 5, assists: 5, cs: 150, gold: 10_000, damage: 15_000, damageTaken: 15_000, vision: 20, wardsPlaced: 8, items: null, spells: null, runes: null, stats, ...extra });
/** Nested counters for one game: a double in every second game, a triple (also a double) in every tenth. */
const counters = (i: number) => (i % 10 === 0 ? { doubleKills: 1, tripleKills: 1, quadraKills: 0, pentaKills: 0, largestMultiKill: 3 } : i % 2 === 0 ? { doubleKills: 1, tripleKills: 0, quadraKills: 0, pentaKills: 0, largestMultiKill: 2 } : { doubleKills: 0, tripleKills: 0, quadraKills: 0, pentaKills: 0, largestMultiKill: 1 });

beforeAll(async () => {
  handle = await testDb();
  const db = handle.db;
  await syncStaticData(db, new FixtureStaticProvider(), { fingerprint: false });
  season = await currentSeason(db);
  teamId = (await getOrCreateTeam(db)).id;
  id.Ash = (await createPlayer(db, teamId, { displayName: "Ash", primaryRole: "MID", primaryPool: ["Ahri"] })).id;
  id.Bo = (await createPlayer(db, teamId, { displayName: "Bo", primaryRole: "SUPPORT", primaryPool: ["Lulu"] })).id;
  const [ash] = await db.insert(riotAccounts).values({ ownerType: "player", playerId: id.Ash!, gameName: "ash", tagLine: "T", platform: "euw1", puuid: "puuid-ash", label: "main" }).returning({ id: riotAccounts.id });
  const [bo] = await db.insert(riotAccounts).values({ ownerType: "player", playerId: id.Bo!, gameName: "bo", tagLine: "T", platform: "euw1", puuid: "puuid-bo", label: "main" }).returning({ id: riotAccounts.id });
  const rows: Array<typeof accountMatches.$inferInsert> = [];
  const details: Array<typeof matchDetails.$inferInsert> = [];
  for (let i = 0; i < GAMES; i++) {
    const matchId = `MK_${i}`;
    const gameCreation = NOW - (i + 1) * 3_600_000;
    const ashStats = { doubleKills: i % 3 === 0 ? 1 : 0, tripleKills: 0, quadraKills: 0, pentaKills: i === 5 ? 1 : 0, largestMultiKill: i === 5 ? 5 : 2 };
    if (i === 5) Object.assign(ashStats, { doubleKills: 1, tripleKills: 1, quadraKills: 1 });
    rows.push({ accountId: ash!.id, matchId, gameCreation, queueId: 420, championId: "Ahri", role: "MID", win: true, patch: `${season}.20`, gameDuration: 1800, kills: 6, deaths: 3, assists: 5, cs: 200, damage: 20_000, visionScore: 15 });
    const parts: MatchParticipantDetail[] = [part("puuid-ash", 100, "MIDDLE", "Ahri", ashStats)];
    // Bo is Ash's support in every fourth game: a team member, never in the comparison.
    if (i % 4 === 0) {
      rows.push({ accountId: bo!.id, matchId, gameCreation, queueId: 420, championId: "Lulu", role: "SUPPORT", win: true, patch: `${season}.20`, gameDuration: 1800, kills: 1, deaths: 3, assists: 15, cs: 30, damage: 8_000, visionScore: 60 });
      parts.push(part("puuid-bo", 100, "UTILITY", "Lulu", { doubleKills: 9, tripleKills: 9, quadraKills: 9, pentaKills: 9, largestMultiKill: 5 }));
    }
    for (let n = parts.length; n < 9; n++) {
      const position = POSITIONS[n % 5]!;
      parts.push(part(`other-${i}-${n}`, n < 5 ? 100 : 200, position, n === 7 ? "Katarina" : `Champ${n}`, counters(i + n)));
    }
    // A removed player (personal data erased) and one record without counters: neither counts.
    parts.push(part("", 200, "", "", undefined, { removed: true, championId: null, position: null }));
    if (i === 0) parts[parts.length - 2] = { ...parts[parts.length - 2]!, stats: { wardsKilled: 2 } };
    details.push({ matchId, platform: "euw1", queueId: 420, gameCreation, gameDuration: 1800, gameVersion: `${season}.20.1`, teams: [], participants: parts });
  }
  await db.insert(accountMatches).values(rows);
  await db.insert(matchDetails).values(details);
  invalidateLeaderboardCache();
  invalidateMultikillBaselineCache();
  invalidateMultikillCountingCache();
}, 60_000);
afterAll(async () => {
  await handle.close();
});

describe("the multikill comparison on stored records", () => {
  it("counts every other participant of the season's games, as aggregates: never a team member, a removed player or a record without counters", async () => {
    const data = await loadLeaderboardData(handle.db, teamId);
    const b = await loadMultikillBaseline(handle.db, teamId, data, recordsSeason(data, {}));
    // 140 records: 8 other players each, but 35 records give Bo a seat (7 others), and one other player in MK_0 has no counters.
    expect(b.all.games).toBe(GAMES * 8 - 35 - 1);
    expect(b.source).toBe("same-games");
    // Riot's positions as roles; the members' own (Ash's Ahri, Bo's 9 pentakills) nowhere in it.
    expect(Object.keys(b.roles).sort()).toEqual(["ADC", "JUNGLE", "MID", "SUPPORT", "TOP"]);
    expect(b.champions["MID|Ahri"]).toBeUndefined();
    expect(b.champions["SUPPORT|Lulu"]).toBeUndefined();
    expect(b.all.events.penta).toBe(0);
    expect(b.champions["MID|Katarina"]!.games).toBe(GAMES);
    // Nested counters, read as such from the records (a triple game also counts its double), so a triple is one event.
    expect(b.reading).toMatchObject({ rule: "nested", shown: true });
    const triples = b.all.events.triple;
    expect(triples).toBeGreaterThan(20);
  });

  it("is cached per team and season, and gives the page a score compared with the same games", async () => {
    const data = await loadLeaderboardData(handle.db, teamId);
    const first = await loadMultikillBaseline(handle.db, teamId, data, season);
    expect(await loadMultikillBaseline(handle.db, teamId, data, season)).toBe(first);
    const view = buildLeaderboardsView(data, {}, null, { multikillBaseline: first }).records.multikills;
    expect(view.source).toBe("same-games");
    const ash = view.rows.find((r) => r.playerId === id.Ash)!;
    expect(ash.status).toBe("ranked");
    // Shown each multikill once, as the score counts them: Riot's nested counters (the pentakill game's double, triple and quadra included) kept apart.
    expect(ash.counts).toEqual({ double: 47, triple: 0, quadra: 0, penta: 1 });
    expect(ash.riot).toEqual({ double: 48, triple: 1, quadra: 1, penta: 1 });
    expect(ash.kinds.map((k) => k.text)).toEqual(["1 penta", "47 doubles"]);
    expect(ash.breakdown).toContain("1 penta (");
    expect(ash.breakdown).toContain("47 doubles (");
    expect(ash.breakdown).toContain("no triples (");
    // Nothing of any other player reaches the page: no PUUID, no name.
    expect(JSON.stringify(view)).not.toMatch(/other-|puuid/);
  });

  it("reads Riot's counting once for every page, from the linked players' own games (two counts), so the profile shows the board's counts", async () => {
    invalidateMultikillCountingCache();
    // Bo's 35 games with nested counters {9, 9, 9, 9} and Ash's pentakill game: 36 games with a triple, none out of the nested order.
    expect(await loadCountingReading(handle.db)).toEqual({ rule: "nested", shown: true, evidence: { withTriple: 36, outOfOrder: 0 } });
    const data = await loadLeaderboardData(handle.db, teamId);
    const board = buildLeaderboardsView(data, {}, null, { multikillBaseline: await loadMultikillBaseline(handle.db, teamId, data, season) }).records.multikills;
    const ash = board.rows.find((r) => r.playerId === id.Ash)!;
    const player = (await getPlayer(handle.db, id.Ash!))!;
    const overview = await getPlayerOverview(handle.db, player, { mode: "all", now: new Date(NOW), riotConfigured: false });
    const { double, triple, quadra, penta } = overview.summary.multikills;
    expect({ double, triple, quadra, penta }).toEqual(ash.counts);
    expect(ash.counts).toEqual({ double: 47, triple: 0, quadra: 0, penta: 1 });
  });
});
