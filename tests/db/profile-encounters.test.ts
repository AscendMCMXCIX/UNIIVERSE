import { createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";
import { accountMatches, matchDetails, riotAccounts, type MatchParticipantDetail } from "@/server/db/schema";
import { createPlayer, getOrCreateTeam, setTeamMember } from "@/server/repositories/team";
import { ENCOUNTER_GAMES_SHOWN, loadEncounterDetail, loadEncounterPage, type EncounterScope } from "@/server/players/encounters";
import { getMatchHistory } from "@/server/players/match-history";
import { dedupeGames, gamesFor, type SeasonGame, type SeasonMode } from "@/domain/season-stats";
import { encounterGames, encounterInsights, listEncounters, summariseEncounters, type EncounterRelation, type EncounterRow, type EncounterSort } from "@/domain/encounters";

/*
  A player's Encounters are counted in the database (server/players/encounters.ts). This checks the
  query against the counting rules written in TypeScript (domain/encounters.ts), applied here to the
  stored rows, on a random but repeatable history of one player with two accounts: a game stored
  on both accounts, teammates and a personal-use player in the games, renamed players, two players
  sharing one name, nameless and accountless records, a player listed twice in one game (once on
  each side), records without a side, unknown results, games without a champion or without
  details, public ("26.3"), padded and unreadable patches across two seasons, every game mode and
  queues outside them. Every list, count, highlight and player window must match, for every
  season, game mode and account choice, and the games counted must be the games Match History lists.
*/

let handle: DbHandle;
const ids: Record<string, string> = {};
const acc: Record<string, string> = {};

/** The opaque key the page gets for an account (never the PUUID). */
const keyOf = (puuid: string) => createHash("sha256").update(`uniiverse-encounter:${puuid}`).digest("base64url").slice(0, 16);

/** The encounter rows of a scope by the documented rules, from the stored rows. */
async function reference(scope: EncounterScope): Promise<{ games: number; rows: EncounterRow[] }> {
  const db = handle.db;
  const stored = await db.select().from(accountMatches).where(and(inArray(accountMatches.accountId, [...scope.accountIds]), isNotNull(accountMatches.championId)));
  // The games Match History lists: one record per match (dedupeGames), in the season and mode.
  const games = gamesFor(dedupeGames(stored as unknown as SeasonGame[]), { season: scope.season, mode: scope.mode }) as unknown as typeof stored;
  const linked = new Set((await db.select({ puuid: riotAccounts.puuid }).from(riotAccounts).where(eq(riotAccounts.ownerType, "player"))).map((r) => r.puuid));
  const details = new Map((await db.select({ matchId: matchDetails.matchId, participants: matchDetails.participants }).from(matchDetails)).map((d) => [d.matchId, d.participants]));
  const rows: EncounterRow[] = [];
  for (const g of games) {
    const participants = details.get(g.matchId);
    if (!participants || g.teamId === null) continue;
    for (const p of participants) {
      if (!p.puuid || !p.name || linked.has(p.puuid)) continue;
      rows.push({ matchId: g.matchId, gameCreation: g.gameCreation, queueId: g.queueId, win: g.win, memberChampion: g.championId, key: keyOf(p.puuid), name: p.name, relation: p.teamId === g.teamId ? "ally" : "opponent", otherChampion: p.championId ?? null });
    }
  }
  return { games: games.length, rows };
}

/** A small seeded random generator (mulberry32), so a failure can be replayed. */
function random(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MODES: SeasonMode[] = ["all", "solo", "flex", "normal"];
const scopes = () => MODES.flatMap((mode) => [15, 16].flatMap((season) => [[acc.ace!, acc.ace2!], [acc.ace!], [acc.ace2!]].map((accountIds) => ({ accountIds, season, mode }))));

beforeAll(async () => {
  handle = await testDb();
  const db = handle.db;
  const teamId = (await getOrCreateTeam(db)).id;
  for (const [name, role] of [["Ace", "TOP"], ["Bea", "JUNGLE"], ["Solo", "SUPPORT"]] as const) {
    ids[name] = (await createPlayer(db, teamId, { displayName: name, primaryRole: role, primaryPool: [] })).id;
  }
  await setTeamMember(db, teamId, ids.Solo!, false); // personal use: still a UNIIVERSE profile, never listed
  for (const [key, player] of [["ace", "Ace"], ["ace2", "Ace"], ["bea", "Bea"], ["solo", "Solo"]] as const) {
    const [r] = await db.insert(riotAccounts).values({ ownerType: "player", playerId: ids[player]!, gameName: key, tagLine: "T", platform: "oc1", puuid: `p-${key}`, label: key }).returning({ id: riotAccounts.id });
    acc[key] = r!.id;
  }
  // An enemy roster's account is still someone met: only UNIIVERSE profiles are left out.
  await db.insert(riotAccounts).values({ ownerType: "opponent", gameName: "Regular 1", tagLine: "OCE", platform: "oc1", puuid: "r-1", label: "main" });

  const rand = random(20261021);
  const pick = <T,>(list: readonly T[]) => list[Math.floor(rand() * list.length)]!;
  const champions = ["Ahri", "Jinx", "Viego", "Riven", "Thresh", "Lux", "Garen", "MonkeyKing", "Kai'Sa"];
  const regulars = Array.from({ length: 24 }, (_, i) => ({ puuid: `r-${i}`, before: `Regular ${i}#OCE`, after: i % 3 === 0 ? `Renamed ${i}#OCE` : `Regular ${i}#OCE` }));
  // Two accounts with one name: two players, however alike they look.
  const namesakes = ["n-1", "n-2"];
  const start = Date.UTC(2025, 11, 12);
  const renamedAt = Date.UTC(2026, 1, 1);
  const games: Array<typeof accountMatches.$inferInsert> = [];
  const details: Array<typeof matchDetails.$inferInsert> = [];
  let fresh = 0;
  let at = start;
  for (let i = 0; i < 240; i++) {
    // Match ids of different lengths sort as text; two games share a start time.
    const matchId = `OC1_${i % 2 ? 100 + i : 10_000 + i}`;
    if (i !== 120) at = start + i * 5 * 3_600_000 + Math.floor(rand() * 1000);
    const patch = rand() < 0.05 ? null : rand() < 0.05 ? pick(["unreadable", "16.3.1", "16"]) : at < Date.UTC(2026, 0, 8) ? pick(["15.24", "25.24"]) : pick(["16.1", "16.2", "26.3", " 16.4 ", "016.5"]);
    const queueId = pick([420, 420, 420, 440, 440, 400, 430, 480, 490, 700, 450, null]);
    const blueWins = rand() < 0.5;
    const side = rand() < 0.5 ? 100 : 200;
    const won = side === 100 ? blueWins : !blueWins;
    const parts: MatchParticipantDetail[] = [];
    const add = (puuid: string, name: string | null, teamId: number | null, championId: string | null) => {
      const p: MatchParticipantDetail = { puuid, name, teamId: teamId as number, championId, championKey: 0, champLevel: 15, position: null, win: teamId === 100 ? blueWins : !blueWins, kills: 3, deaths: 2, assists: 4, cs: 150, gold: 9000, damage: 12000, damageTaken: 15000, vision: 20, wardsPlaced: 8, items: null, spells: null, runes: null };
      if (teamId === null) delete (p as Partial<MatchParticipantDetail>).teamId;
      parts.push(p);
    };
    // The player, now and then on both accounts (each record with its own quirks).
    for (const key of rand() < 0.06 ? ["ace", "ace2"] : [rand() < 0.7 ? "ace" : "ace2"]) {
      const championId = rand() < 0.03 ? null : pick(champions);
      games.push({ accountId: acc[key]!, matchId, gameCreation: at, queueId, championId, role: "MID", win: rand() < 0.04 ? null : won, teamId: rand() < 0.03 ? null : side, patch, gameDuration: 1800, summarisedAt: new Date() });
      add(`p-${key}`, `${key}#T`, side, championId);
    }
    // Profiles in the game: a teammate (on either side) and the personal-use player.
    if (rand() < 0.3) {
      add("p-bea", "bea#T", rand() < 0.85 ? side : 300 - side, pick(champions));
      games.push({ accountId: acc.bea!, matchId, gameCreation: at, queueId, championId: pick(champions), role: "JUNGLE", win: won, teamId: side, patch, gameDuration: 1800, summarisedAt: new Date() });
    }
    if (rand() < 0.08) add("p-solo", "solo#T", 300 - side, pick(champions));
    if (rand() < 0.15) add(pick(namesakes), "Same Name#OCE", rand() < 0.5 ? 100 : 200, pick(champions));
    while (parts.length < 10) {
      const team = parts.filter((p) => p.teamId === 100).length < 5 ? 100 : 200;
      const regular = rand() < 0.5 ? pick(regulars) : null;
      const puuid = regular ? regular.puuid : rand() < 0.02 ? "" : `f-${fresh++}`;
      const name = rand() < 0.04 ? null : regular ? (at < renamedAt ? regular.before : regular.after) : `Fresh ${fresh}#OCE`;
      add(puuid, name, rand() < 0.02 ? null : team, rand() < 0.02 ? null : pick(champions));
      // Listed twice in one game, now and then once on each side.
      if (regular && rand() < 0.03) add(puuid, name, rand() < 0.5 ? team : 300 - team, parts[parts.length - 1]!.championId);
    }
    if (rand() < 0.96) details.push({ matchId, gameCreation: at, gameDuration: 1800, teams: [], participants: parts });
  }
  await db.insert(accountMatches).values(games);
  await db.insert(matchDetails).values(details);
}, 120_000);

afterAll(async () => {
  await handle.close();
});

describe("a player's Encounters, counted in the database", () => {
  it("gives every list, count and highlight the counting rules give, for every season, mode, account and list choice", async () => {
    let listed = 0;
    let highlighted = 0;
    for (const scope of scopes()) {
      const { games, rows } = await reference(scope);
      const all = summariseEncounters(rows);
      const insights = encounterInsights(all);
      highlighted += insights.length;
      for (const relation of ["opponents", "allies", "everyone"] as EncounterRelation[]) {
        for (const sort of ["games", "best", "worst"] as EncounterSort[]) {
          for (const [min, q] of [[1, ""], [2, ""], [3, "renamed"], [5, ""], [1, "same NAME"]] as const) {
            const page = await loadEncounterPage(handle.db, scope, { relation, min, sort, q, limit: 25 });
            const expected = listEncounters(all, { relation, min, sort, query: q });
            const where = JSON.stringify({ scope: { ...scope, accountIds: scope.accountIds.length }, relation, sort, min, q });
            expect(page.list, where).toEqual(expected.slice(0, 25));
            expect(page.total, where).toBe(expected.length);
            expect(page.games, where).toBe(games);
            expect(page.withPlayers, where).toBe(new Set(rows.map((r) => r.matchId)).size);
            expect(page.insights, where).toEqual(insights);
            listed += Math.min(25, expected.length);
          }
        }
      }
    }
    // The history is rich enough for the comparison to mean something.
    expect(listed).toBeGreaterThan(5000);
    expect(highlighted).toBeGreaterThan(40);
  }, 240_000);

  it("opens one player's window with the same record and games, and nothing for anyone not met in the scope", async () => {
    let opened = 0;
    for (const scope of scopes().filter((s) => s.mode === "all" || s.accountIds.length === 2)) {
      const { rows } = await reference(scope);
      const all = summariseEncounters(rows);
      // The most met, the ones met once, and the namesakes.
      const keys = new Set([...listEncounters(all, { relation: "everyone", min: 1, sort: "games" }).slice(0, 6), ...all.filter((s) => s.games === 1).slice(0, 3), ...all.filter((s) => s.name === "Same Name#OCE")].map((s) => s.key));
      for (const key of keys) {
        const detail = await loadEncounterDetail(handle.db, scope, key);
        expect(detail?.summary).toEqual(all.find((s) => s.key === key));
        expect(detail?.games).toEqual(encounterGames(rows, key).slice(0, ENCOUNTER_GAMES_SHOWN));
        opened++;
      }
      // Teammates, the player's own accounts and players never met are nobody here.
      for (const puuid of ["p-bea", "p-solo", "p-ace", "p-ace2", "nobody"]) expect(await loadEncounterDetail(handle.db, scope, keyOf(puuid))).toBeNull();
    }
    expect(opened).toBeGreaterThan(100);
    // The namesakes stay two players.
    const { rows } = await reference({ accountIds: [acc.ace!, acc.ace2!], season: 16, mode: "all" });
    expect(summariseEncounters(rows).filter((s) => s.name === "Same Name#OCE")).toHaveLength(2);
  }, 240_000);

  it("counts exactly the games Match History lists for the same season, mode and account", async () => {
    for (const mode of MODES) {
      for (const accountId of [null, acc.ace!, acc.ace2!]) {
        const history = await getMatchHistory(handle.db, ids.Ace!, { season: 16, mode, accountId }, false);
        const page = await loadEncounterPage(handle.db, { accountIds: accountId ? [accountId] : [acc.ace!, acc.ace2!], season: 16, mode }, { relation: "everyone", min: 1, sort: "games", q: "", limit: 1 });
        expect(page.games, `${mode} ${accountId}`).toBe(history.total);
        expect(page.games).toBeGreaterThan(0);
      }
    }
  }, 120_000);

  it("sends a small page with opaque keys, never an account identifier", async () => {
    const scope: EncounterScope = { accountIds: [acc.ace!, acc.ace2!], season: 16, mode: "all" };
    const page = await loadEncounterPage(handle.db, scope, { relation: "everyone", min: 1, sort: "games", q: "", limit: 25 });
    const detail = await loadEncounterDetail(handle.db, scope, page.list[0]!.key);
    for (const answer of [JSON.stringify(page), JSON.stringify(detail)]) expect(answer).not.toMatch(/"(p|r|f|n)-[\w-]*"/);
    expect(page.list.every((s) => /^[\w-]{16}$/.test(s.key))).toBe(true);
    expect(JSON.stringify(page).length).toBeLessThan(10_000);
    expect(await loadEncounterPage(handle.db, { ...scope, accountIds: [] }, { relation: "everyone", min: 1, sort: "games", q: "", limit: 25 })).toEqual({ games: 0, withPlayers: 0, list: [], total: 0, insights: [] });
    expect(await loadEncounterDetail(handle.db, { ...scope, accountIds: [] }, page.list[0]!.key)).toBeNull();
  });
});
