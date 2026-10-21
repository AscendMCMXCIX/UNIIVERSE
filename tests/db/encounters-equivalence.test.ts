import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, isNotNull, sql } from "drizzle-orm";
import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";
import type { Db } from "@/server/db/types";
import { accountMatches, matchDetails, riotAccounts, type MatchParticipantDetail } from "@/server/db/schema";
import { createPlayer, getOrCreateTeam, setTeamMember } from "@/server/repositories/team";
import { encounterKey, loadEncounters } from "@/server/matches/encounters";
import { seasonOfGame } from "@/domain/season";
import { encounterGames, encounterInsights, filterEncounterRows, listEncounters, summariseEncounters, type EncounterFilter, type EncounterRow, type EncounterSort, type EncounterView } from "@/domain/encounters";

/*
  The Encounters loader reads a compact answer from the database (21 Oct 2026) instead of every
  encounter row. This compares it with the previous loader, kept below as the reference, on a
  random but repeatable history: members on both sides, a member's game stored on two accounts,
  duo and trio games, renamed players, nameless and accountless records, a player listed twice in
  one game, a missing side, unknown results, unreadable and missing patches across two seasons,
  every game mode, games without details. Every list, record, insight and game list must be the
  same for every season, mode, member and account filter.
*/

let handle: DbHandle;
let teamId: string;

/** The rows as the loader read them before 21 Oct 2026: every encounter row of players met twice or more. */
async function previousRows(db: Db, accountIds: string[]): Promise<EncounterRow[]> {
  const linked = (await db.select({ puuid: riotAccounts.puuid }).from(riotAccounts).where(and(eq(riotAccounts.ownerType, "player"), isNotNull(riotAccounts.puuid)))).map((r) => r.puuid!).filter(Boolean);
  const idList = sql.join(accountIds.map((id) => sql`${id}::uuid`), sql`, `);
  const notLinked = linked.length ? sql`AND p->>'puuid' NOT IN (${sql.join(linked.map((x) => sql`${x}`), sql`, `)})` : sql``;
  const result = await db.execute(sql`
    WITH mine AS (
      SELECT DISTINCT ON (ra.player_id, am.match_id) ra.player_id, am.account_id, am.match_id, am.game_creation, am.queue_id, am.patch, am.win, am.team_id, am.champion_id
      FROM account_matches am JOIN riot_accounts ra ON ra.id = am.account_id
      WHERE am.account_id IN (${idList}) AND am.champion_id IS NOT NULL AND am.team_id IS NOT NULL
      ORDER BY ra.player_id, am.match_id, am.account_id
    ),
    enc AS (
      SELECT m.*, p->>'puuid' AS puuid, p->>'name' AS name, (p->>'teamId')::int AS other_team, p->>'championId' AS other_champion
      FROM mine m
      JOIN match_details d ON d.match_id = m.match_id
      CROSS JOIN LATERAL jsonb_array_elements(d.participants) p
      WHERE coalesce(p->>'puuid', '') <> '' AND coalesce(p->>'name', '') <> '' ${notLinked}
    ),
    repeated AS (SELECT puuid FROM enc GROUP BY puuid HAVING count(DISTINCT match_id) >= 2)
    SELECT enc.* FROM enc JOIN repeated USING (puuid)`);
  type Row = { player_id: string; account_id: string; match_id: string; game_creation: string | number; queue_id: number | null; patch: string | null; win: boolean | null; team_id: number; champion_id: string | null; puuid: string; name: string; other_team: number | null; other_champion: string | null };
  const raw = ((result as { rows?: Row[] }).rows ?? (result as unknown as Row[])) as Row[];
  const rows: EncounterRow[] = raw.map((r) => {
    const gameCreation = Number(r.game_creation);
    return { matchId: r.match_id, playerId: r.player_id, accountId: r.account_id, gameCreation, queueId: r.queue_id === null ? null : Number(r.queue_id), season: seasonOfGame(r.patch, gameCreation), win: r.win, memberChampion: r.champion_id, key: encounterKey(r.puuid), name: r.name, relation: Number(r.other_team) === Number(r.team_id) ? "ally" : "opponent", otherChampion: r.other_champion };
  });
  const latest = new Map<string, { at: number; name: string }>();
  for (const r of rows) if ((latest.get(r.key)?.at ?? -Infinity) < r.gameCreation) latest.set(r.key, { at: r.gameCreation, name: r.name });
  for (const r of rows) r.name = latest.get(r.key)!.name;
  return rows;
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

const ids: Record<string, string> = {};
const acc: Record<string, string> = {};

beforeAll(async () => {
  handle = await testDb();
  const db = handle.db;
  teamId = (await getOrCreateTeam(db)).id;
  for (const [name, role] of [["Ace", "TOP"], ["Bea", "JUNGLE"], ["Cy", "MID"], ["Dee", "ADC"], ["Solo", "SUPPORT"]] as const) {
    ids[name] = (await createPlayer(db, teamId, { displayName: name, primaryRole: role, primaryPool: [] })).id;
  }
  await setTeamMember(db, teamId, ids.Solo!, false); // personal use: never a member, never another player
  for (const [key, player] of [["ace", "Ace"], ["ace2", "Ace"], ["bea", "Bea"], ["cy", "Cy"], ["dee", "Dee"], ["solo", "Solo"]] as const) {
    const [r] = await db.insert(riotAccounts).values({ ownerType: "player", playerId: ids[player]!, gameName: key, tagLine: "T", platform: "oc1", puuid: `p-${key}`, label: key }).returning({ id: riotAccounts.id });
    acc[key] = r!.id;
  }

  const rand = random(20261021);
  const pick = <T,>(list: readonly T[]) => list[Math.floor(rand() * list.length)]!;
  const champions = ["Ahri", "Jinx", "Viego", "Riven", "Thresh", "Lux", "Garen", "MonkeyKing", "Kai'Sa"];
  const regulars = Array.from({ length: 28 }, (_, i) => ({ puuid: `r-${i}`, before: `Regular ${i}#OCE`, after: i % 3 === 0 ? `Renamed ${i}#OCE` : `Regular ${i}#OCE` }));
  // Players met in exactly two games: often once alongside and once against, which no view shows.
  const twice = new Map<number, string[]>();
  for (let t = 0; t < 40; t++) {
    const first = Math.floor(rand() * 259);
    for (const i of [first, first + 1 + Math.floor(rand() * (259 - first))]) twice.set(i, [...(twice.get(i) ?? []), `t-${t}`]);
  }
  const start = Date.UTC(2025, 11, 12);
  const renamedAt = Date.UTC(2026, 0, 20);
  const games: Array<typeof accountMatches.$inferInsert> = [];
  const details: Array<typeof matchDetails.$inferInsert> = [];
  let fresh = 0;
  for (let i = 0; i < 260; i++) {
    const matchId = `OC1_${1000 + i}`;
    const at = start + i * 5 * 3_600_000 + Math.floor(rand() * 1000);
    const patch = rand() < 0.06 ? null : rand() < 0.04 ? "unreadable" : at < Date.UTC(2026, 0, 8) ? pick(["15.24", "25.24"]) : pick(["16.1", "16.2", "16.3"]);
    const queueId = pick([420, 420, 420, 440, 440, 400, 430, 700, null]);
    const blueWins = rand() < 0.5;
    const count = rand() < 0.6 ? 1 : rand() < 0.75 ? 2 : 3;
    const members = ["ace", "bea", "cy", "dee"];
    for (let j = members.length - 1; j > 0; j--) {
      const k = Math.floor(rand() * (j + 1));
      [members[j], members[k]] = [members[k]!, members[j]!];
    }
    members.length = count;
    if (rand() < 0.08) members.push("solo");
    const side = rand() < 0.5 ? 100 : 200;
    const parts: MatchParticipantDetail[] = [];
    const add = (puuid: string, name: string | null, teamId: number | null, championId: string | null) => {
      const p: MatchParticipantDetail = { puuid, name, teamId: teamId as number, championId, championKey: 0, champLevel: 15, position: null, win: teamId === 100 ? blueWins : !blueWins, kills: 3, deaths: 2, assists: 4, cs: 150, gold: 9000, damage: 12000, damageTaken: 15000, vision: 20, wardsPlaced: 8, items: null, spells: null, runes: null };
      if (teamId === null) delete (p as Partial<MatchParticipantDetail>).teamId;
      parts.push(p);
    };
    for (const [n, member] of members.entries()) {
      const team = n === 0 || rand() < 0.85 ? side : 300 - side;
      const keys = member === "ace" ? (rand() < 0.05 ? ["ace", "ace2"] : [rand() < 0.75 ? "ace" : "ace2"]) : [member];
      for (const key of keys) {
        const won = team === 100 ? blueWins : !blueWins;
        const championId = pick(champions);
        games.push({ accountId: acc[key]!, matchId, gameCreation: at, queueId, championId, role: "MID", win: rand() < 0.03 ? null : won, teamId: rand() < 0.03 ? null : team, patch, gameDuration: 1800, summarisedAt: new Date() });
        add(`p-${key}`, `${key}#T`, team, championId);
      }
    }
    for (const puuid of twice.get(i) ?? []) add(puuid, `Twice ${puuid}#OCE`, rand() < 0.5 ? 100 : 200, pick(champions));
    while (parts.length < 10) {
      const team = parts.filter((p) => p.teamId === 100).length < 5 ? 100 : 200;
      const regular = rand() < 0.45 ? pick(regulars) : null;
      const puuid = regular ? regular.puuid : rand() < 0.02 ? "" : `f-${fresh++}`;
      const name = rand() < 0.04 ? null : regular ? (at < renamedAt ? regular.before : regular.after) : `Fresh ${fresh}#OCE`;
      add(puuid, name, rand() < 0.02 ? null : team, rand() < 0.02 ? null : pick(champions));
      if (regular && rand() < 0.02) add(puuid, name, team, parts[parts.length - 1]!.championId); // listed twice
    }
    if (rand() < 0.96) details.push({ matchId, gameCreation: at, gameDuration: 1800, teams: [], participants: parts });
  }
  await db.insert(accountMatches).values(games);
  await db.insert(matchDetails).values(details);
}, 120_000);

afterAll(async () => {
  await handle.close();
});

describe("the compact Encounters answer", () => {
  it("gives every list, record, insight and game list the previous rows gave, for every filter", async () => {
    const data = await loadEncounters(handle.db, teamId, { cache: false });
    const accountIds = Object.values(data.members).flatMap((m) => m.accounts.map((a) => a.id)).sort();
    const before = await previousRows(handle.db, accountIds);
    expect(before.length).toBeGreaterThan(200);
    // Fewer rows (players no view can show are left out), never a PUUID.
    expect(data.rows.length).toBeLessThan(before.length);
    expect(JSON.stringify(data.rows)).not.toMatch(/"(p|r|f|t)-[\w-]*"/);

    const filters: EncounterFilter[] = [];
    for (const season of [null, 15, 16]) {
      for (const queues of [null, [420], [440], [400, 430, 480, 490], [700]]) {
        filters.push({ season, queues, playerId: null, accountId: null });
        for (const member of ["Ace", "Bea", "Dee"]) filters.push({ season, queues, playerId: ids[member]!, accountId: null });
        for (const key of ["ace", "ace2"]) filters.push({ season, queues, playerId: ids.Ace!, accountId: acc[key]! });
      }
    }
    let listed = 0;
    for (const f of filters) {
      const was = summariseEncounters(filterEncounterRows(before, f));
      const now = summariseEncounters(filterEncounterRows(data.rows, f));
      for (const view of ["allies", "opponents", "shared"] as EncounterView[]) {
        for (const min of [2, 3, 5]) {
          for (const sort of (view === "shared" ? ["games"] : ["games", "best", "worst"]) as EncounterSort[]) {
            for (const query of ["", "renamed"]) {
              const expected = listEncounters(was, { view, min, sort, query });
              expect(listEncounters(now, { view, min, sort, query }), JSON.stringify({ f, view, min, sort, query })).toEqual(expected);
              listed += expected.length;
            }
          }
        }
      }
      // Insights: the same kind, record, games and last game (equal candidates may be named in another order).
      const insight = (all: typeof was) => encounterInsights(all).insights.map((i) => ({ kind: i.kind, record: i.record, games: i.summary.games, last: i.summary.lastPlayedAt }));
      expect(insight(now)).toEqual(insight(was));
      expect(encounterInsights(now).sharedPlayers).toBe(encounterInsights(was).sharedPlayers);
      // The player's window: the same record and recorded games.
      for (const s of listEncounters(was, { view: "shared", min: 2, sort: "games" }).concat(listEncounters(was, { view: "allies", min: 2, sort: "games" }), listEncounters(was, { view: "opponents", min: 2, sort: "games" }))) {
        expect(encounterGames(filterEncounterRows(data.rows, f), s.key)).toEqual(encounterGames(filterEncounterRows(before, f), s.key));
        expect(now.find((n) => n.key === s.key)).toEqual(s);
      }
    }
    expect(listed).toBeGreaterThan(1000);
  });
});
