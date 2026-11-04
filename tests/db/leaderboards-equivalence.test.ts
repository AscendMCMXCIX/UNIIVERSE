import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";
import { accountMastery, accountMatches, riotAccounts } from "@/server/db/schema";
import { currentSeason } from "@/server/accounts/sync";
import { createPlayer, getOrCreateTeam, setLineupSlot } from "@/server/repositories/team";
import { invalidateLeaderboardCache, loadLeaderboardData, type LeaderboardData } from "@/server/leaderboards/service";
import { buildRecentLeaderboardView } from "@/server/leaderboards/recent-view";
import { LEADERBOARD_ROLES, isLeaderboardRole, type LeaderboardExtra, type LeaderboardGame } from "@/domain/leaderboards";
import { FixtureStaticProvider } from "@/server/riot/static/fixture";
import { syncStaticData } from "@/server/riot/static/sync";

/*
  Team Leaderboards read every stored game as one compact answer (service.ts, storedGames) instead
  of one row per game. This proves the change kept every board: a seeded history with everything a
  stored game can be (no result, K/D/A unavailable, missing figures, a match on two of a player's
  accounts with and without its details, extra figures absent, empty, partial, null or unknown) is
  read both ways, and the games, the stored-row count and every statistic's board in every scope
  must match. The previous reading is kept below as the reference.
*/

let handle: DbHandle;
let teamId: string;
let season: number;
const players: string[] = [];
const playerOf = new Map<string, string>();

function random(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const EXTRA_KEYS = ["doubleKills", "tripleKills", "quadraKills", "pentaKills", "largestMultiKill", "largestKillingSpree", "firstBloodKill", "firstBloodAssist", "wardsKilled", "controlWardsBought", "objectiveDamage", "buildingDamage", "turretTakedowns", "ccSeconds", "soloKills"];

beforeAll(async () => {
  handle = await testDb();
  const db = handle.db;
  await syncStaticData(db, new FixtureStaticProvider(), { fingerprint: false });
  season = await currentSeason(db);
  teamId = (await getOrCreateTeam(db)).id;
  const rand = random(20261021);
  const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)]!;
  const accounts: string[] = [];
  for (const [i, name] of ["Ace", "Bea", "Cy", "Dee", "Eli"].entries()) {
    const id = (await createPlayer(db, teamId, { displayName: name, primaryRole: LEADERBOARD_ROLES[i]!, primaryPool: [] })).id;
    players.push(id);
    // Ace has a second account: some matches are stored on both.
    for (const label of i === 0 ? ["main", "smurf"] : ["main"]) {
      const [row] = await db.insert(riotAccounts).values({ ownerType: "player", playerId: id, gameName: `${name}-${label}`, tagLine: "OCE", platform: "oc1", puuid: `puuid-${name}-${label}`, label }).returning({ id: riotAccounts.id });
      accounts.push(row!.id);
      playerOf.set(row!.id, id);
    }
  }
  await setLineupSlot(db, teamId, "TOP", players[0]!);
  await setLineupSlot(db, teamId, "JUNGLE", players[1]!);

  const full = (): Record<string, number | boolean> => ({ doubleKills: Math.floor(rand() * 3), tripleKills: Math.floor(rand() * 2), quadraKills: rand() < 0.05 ? 1 : 0, pentaKills: rand() < 0.02 ? 1 : 0, largestMultiKill: 2, largestKillingSpree: Math.floor(rand() * 6), firstBloodKill: rand() < 0.2, firstBloodAssist: rand() < 0.3, wardsKilled: Math.floor(rand() * 8), controlWardsBought: Math.floor(rand() * 5), objectiveDamage: Math.floor(rand() * 30000), buildingDamage: Math.floor(rand() * 9000), turretTakedowns: Math.floor(rand() * 4), ccSeconds: Math.floor(rand() * 60), soloKills: Math.floor(rand() * 3) });
  const extraVariants: Array<() => unknown> = [
    () => null,
    () => ({}),
    full,
    () => {
      const f = full();
      for (const k of Object.keys(f)) if (rand() < 0.5) delete f[k];
      return f;
    },
    () => ({ doubleKills: null, firstBloodKill: true }),
    () => ({ doubleKills: null }),
    () => ({ ...full(), futureFigure: 7 }),
  ];
  const games: Array<typeof accountMatches.$inferInsert> = [];
  const patches = [`${season}.1`, `${season}.12`, `${season - 1}.20`, `${season - 10}.3`, null, "unreadable"];
  for (let i = 0; i < 320; i++) {
    const owner = Math.floor(rand() * accounts.length);
    const unavailable = rand() < 0.04;
    const details = rand() < 0.8;
    const base: typeof accountMatches.$inferInsert = {
      accountId: accounts[owner]!,
      matchId: `OC1_${600000000 + i}`,
      gameCreation: Date.UTC(2026, 0, 9) + Math.floor(i / 2) * 3_600_000,
      queueId: pick([420, 420, 440, 400, 430, 490, 700, 1700, null]),
      championId: pick(["Ahri", "Jinx", "Viego", "Riven", "Thresh", "MonkeyKing"]),
      role: pick(["TOP", "JUNGLE", "MID", "ADC", "SUPPORT", "UTILITY", "", null]),
      win: pick([true, false, true, null]),
      patch: pick(patches),
      gameDuration: pick([1800, 1240, 2410, null]),
      kills: unavailable ? -1 : Math.floor(rand() * 15),
      deaths: unavailable ? -1 : Math.floor(rand() * 10),
      assists: unavailable ? -1 : Math.floor(rand() * 20),
      cs: rand() < 0.05 ? null : Math.floor(rand() * 300),
      damage: rand() < 0.05 ? null : Math.floor(rand() * 40000),
      visionScore: rand() < 0.05 ? null : Math.floor(rand() * 80),
      gold: details ? 8000 + Math.floor(rand() * 9000) : null,
      wardsPlaced: details ? Math.floor(rand() * 30) : null,
      teamKills: details ? 10 + Math.floor(rand() * 30) : null,
      teamDamage: details ? 60000 + Math.floor(rand() * 90000) : null,
      extraStats: (details ? pick(extraVariants)() : null) as never,
    };
    games.push(base);
    // The same match stored on Ace's other account: with or without its details, or a game the
    // match-wide tie-breaker decides by account.
    if (owner < 2 && rand() < 0.3) games.push({ ...base, accountId: accounts[1 - owner]!, gold: rand() < 0.5 ? null : base.gold, teamKills: rand() < 0.5 ? null : base.teamKills, extraStats: (rand() < 0.5 ? null : full()) as never });
  }
  // A game without a champion is not a game.
  games.push({ accountId: accounts[2]!, matchId: "OC1_NO_CHAMPION", gameCreation: Date.UTC(2026, 1, 1), queueId: 420, championId: null, role: "MID", win: true, patch: `${season}.1` });
  await db.insert(accountMatches).values(games);
  await db.insert(accountMastery).values(accounts.map((accountId, i) => ({ accountId, championId: "Ahri", points: 1000 * (i + 1), level: 5 })));
  // Mark every game summarised, so the read does not copy figures from match details first.
  await db.execute(sql`UPDATE account_matches SET summarised_at = now()`);
}, 120_000);

afterAll(async () => {
  await handle.close();
});

/** The previous reading (one row per game), with its de-duplication, as it was before the compact answer. */
async function previousGames(accountIds: string[]): Promise<{ games: LeaderboardGame[]; rawGames: number }> {
  const ids = sql.join(accountIds.map((id) => sql`${id}::uuid`), sql`, `);
  const result = await handle.db.execute(sql`
    SELECT match_id, account_id, queue_id, champion_id, role, win, patch, game_creation, game_duration,
           kills, deaths, assists, cs, damage, vision_score, gold, wards_placed, team_kills, team_damage, extra_stats AS stats
    FROM account_matches
    WHERE account_id IN (${ids}) AND champion_id IS NOT NULL`);
  type Row = { match_id: string; account_id: string; queue_id: number | null; champion_id: string; role: string | null; win: boolean | null; patch: string | null; game_creation: string | number; game_duration: number | null; kills: number | null; deaths: number | null; assists: number | null; cs: number | null; damage: number | null; vision_score: number | null; gold: number | null; wards_placed: number | null; team_kills: number | null; team_damage: string | number | null; stats: LeaderboardExtra | null };
  const rows = ((result as { rows?: Row[] }).rows ?? (result as unknown as Row[])) as Row[];
  const hasDetails = (r: Row) => (r.team_kills !== null || r.gold !== null ? 1 : 0);
  const sorted = [...rows].sort((a, b) => Number(b.game_creation) - Number(a.game_creation) || hasDetails(b) - hasDetails(a) || a.account_id.localeCompare(b.account_id));
  const seen = new Set<string>();
  const games: LeaderboardGame[] = [];
  for (const r of sorted) {
    const playerId = playerOf.get(r.account_id);
    if (!playerId) continue;
    const k = `${playerId}|${r.match_id}`;
    if (seen.has(k)) continue;
    seen.add(k);
    const unavailable = typeof r.kills === "number" && r.kills < 0;
    const stats = r.stats && typeof r.stats === "object" && Object.keys(r.stats).length > 0 ? r.stats : null;
    games.push({ matchId: r.match_id, playerId, championId: r.champion_id, role: isLeaderboardRole(r.role) ? r.role : null, queueId: r.queue_id, patch: r.patch, win: r.win, gameCreation: Number(r.game_creation), durationS: r.game_duration, kills: unavailable ? null : r.kills, deaths: unavailable ? null : r.deaths, assists: unavailable ? null : r.assists, cs: r.cs, damage: r.damage, vision: r.vision_score, gold: r.gold, wardsPlaced: r.wards_placed, teamKills: r.team_kills, teamDamage: r.team_damage === null ? null : Number(r.team_damage), extra: stats });
  }
  return { games, rawGames: rows.length };
}

const byKey = (games: readonly LeaderboardGame[]) => [...games].sort((a, b) => a.playerId.localeCompare(b.playerId) || a.matchId.localeCompare(b.matchId));
/** What the compact answer keeps of a game's extra figures: the known ones that have a value (an object with none stays an object). */
const known = (extra: LeaderboardExtra | null) => (extra ? Object.fromEntries(Object.entries(extra).filter(([k, v]) => EXTRA_KEYS.includes(k) && v !== null)) : null);

describe("Team Leaderboards, one compact answer", () => {
  it("reads the same games, the same stored-row count and the same boards as one row per game", async () => {
    invalidateLeaderboardCache();
    const data = await loadLeaderboardData(handle.db, teamId);
    const accountIds = [...playerOf.keys()].sort();
    const previous = await previousGames(accountIds);
    expect(data.rawGames).toBe(previous.rawGames);
    expect(data.rawGames).toBeGreaterThan(300);
    expect(data.games.length).toBe(previous.games.length);
    // Every game identical; the extra figures identical but for the unknown or null names left out.
    expect(byKey(data.games)).toEqual(byKey(previous.games).map((g) => ({ ...g, extra: known(g.extra) })));
    // The variants were really there: unknown and null figures, and games with an empty or no object.
    expect(previous.games.some((g) => g.extra && "futureFigure" in g.extra)).toBe(true);
    expect(previous.games.some((g) => g.extra && Object.values(g.extra).includes(null as never))).toBe(true);
    expect(data.games.some((g) => g.extra && Object.keys(g.extra).length === 0)).toBe(true);
    expect(data.games.some((g) => g.kills === null)).toBe(true);

    // Both views (Recent form; Records & achievements for this season and the last), for a member
    // and for a viewer off the board: the same boards from either answer.
    const before: LeaderboardData = { ...data, games: previous.games };
    const now = new Date(Math.max(...data.games.map((g) => g.gameCreation)) + 3_600_000);
    const requests = [{ tab: "form" as const }, { tab: "records" as const, season }, { tab: "records" as const, season: season - 1 }];
    let boards = 0;
    for (const request of requests) {
      for (const viewer of [players[0]!, null]) {
        expect(buildRecentLeaderboardView(data, request, viewer, { now }), JSON.stringify(request)).toEqual(buildRecentLeaderboardView(before, request, viewer, { now }));
        boards++;
      }
    }
    expect(boards).toBe(6);
    // The views had something to compare: a ranked or provisional row, and a held record.
    const form = buildRecentLeaderboardView(data, { tab: "form" }, null, { now }).form!;
    expect(form.rows.length + form.notEnough.length).toBeGreaterThan(0);
    expect(buildRecentLeaderboardView(data, { tab: "records", season }, null, { now }).records!.records.some((r) => r.holder)).toBe(true);
  }, 120_000);
});
