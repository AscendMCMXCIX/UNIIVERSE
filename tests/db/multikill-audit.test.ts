import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";
import type { Db } from "@/server/db/types";
import { accountMatches, matchDetails, riotAccounts, type MatchParticipantDetail } from "@/server/db/schema";
import { currentSeason } from "@/server/accounts/sync";
import { summariseMatches } from "@/server/accounts/match-summary";
import { createPlayer, getOrCreateTeam } from "@/server/repositories/team";
import { invalidateLeaderboardCache, loadLeaderboardData } from "@/server/leaderboards/service";
import { invalidateMultikillBaselineCache, loadMultikillBaseline } from "@/server/leaderboards/multikill-baseline";
import { invalidateMultikillCountingCache } from "@/server/accounts/multikill-counting";
import { buildLeaderboardsView, recordsSeason } from "@/server/leaderboards/recent-view";
import { readMultikillAudit, runMultikillAudit } from "@/server/leaderboards/multikill-audit";
import { runJob } from "@/server/jobs";
import { FixtureStaticProvider } from "@/server/riot/static/fixture";
import { syncStaticData } from "@/server/riot/static/sync";

/*
  The multikill fairness check on stored records (server/leaderboards/multikill-audit, Data jobs
  `multikill-audit`): the board exactly as the page builds it, every alternative model, anonymous
  aggregates only, and nothing written. Synthetic records: five members, each in 60 of 300 games
  (sometimes with a teammate member), eight other players with Riot's positions, counters and kills,
  both sides' champion kills, and a removed player now and then. One member's games are bloodier:
  every other player in them makes more multikills.
*/

let handle: DbHandle;
let teamId: string;
// The clock's own hour, so the members stay active (read and played within 30 days) whenever this runs.
const NOW = Math.floor(Date.now() / 3_600_000) * 3_600_000;
const NAMES = ["Ash", "Bo", "Cy", "Dee", "Eve"];
const ROLES = [["MID", "MIDDLE", "Ahri"], ["TOP", "TOP", "Garen"], ["JUNGLE", "JUNGLE", "LeeSin"], ["ADC", "BOTTOM", "Jinx"], ["SUPPORT", "UTILITY", "Lulu"]] as const;
const POSITIONS = ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"] as const;
const GAMES = 300;
const ids: string[] = [];
const matchIds: string[] = [];
const BLOODY = 4; // Eve's games

const part = (puuid: string, teamId: number, position: string, championId: string, kills: number, stats: MatchParticipantDetail["stats"], extra: Partial<MatchParticipantDetail> = {}): MatchParticipantDetail => ({ puuid, name: `${puuid}#X`, teamId, championId, championKey: 1, champLevel: 15, position, win: teamId === 100, kills, deaths: 5, assists: 5, cs: 150, gold: 10_000, damage: 15_000, damageTaken: 15_000, vision: 20, wardsPlaced: 8, items: null, spells: null, runes: null, stats, ...extra });

async function tableCounts(db: Db): Promise<Record<string, number>> {
  const rows = (r: unknown) => ((r as { rows?: Array<Record<string, unknown>> }).rows ?? (r as Array<Record<string, unknown>>));
  const tables = rows(await db.execute(sql`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename NOT IN ('job_runs', 'data_refresh_status') ORDER BY 1`)).map((t) => String(t.tablename));
  const out: Record<string, number> = {};
  for (const t of tables) out[t] = Number(rows(await db.execute(sql`SELECT count(*) AS n FROM ${sql.identifier(t)}`))[0]!.n);
  return out;
}

beforeAll(async () => {
  handle = await testDb();
  const db = handle.db;
  await syncStaticData(db, new FixtureStaticProvider(), { fingerprint: false });
  const season = await currentSeason(db);
  teamId = (await getOrCreateTeam(db)).id;
  const read = { syncStatus: "ok", syncCursor: Math.floor(NOW / 1000), lastSyncAt: new Date(NOW) } as const;
  const accounts: string[] = [];
  for (let m = 0; m < NAMES.length; m++) {
    const [role, , champion] = ROLES[m]!;
    ids.push((await createPlayer(db, teamId, { displayName: NAMES[m]!, primaryRole: role, primaryPool: [champion] })).id);
    const [a] = await db.insert(riotAccounts).values({ ownerType: "player", playerId: ids[m]!, gameName: NAMES[m]!.toLowerCase(), tagLine: "T", platform: "euw1", puuid: `puuid-${NAMES[m]!.toLowerCase()}`, label: "main", ...read }).returning({ id: riotAccounts.id });
    accounts.push(a!.id);
  }
  let seed = 4242;
  const rnd = () => ((seed = (Math.imul(seed, 1_103_515_245) + 12_345) >>> 0) / 4_294_967_296);
  const counters = (rate: number) => {
    const d = rnd() < rate ? 1 + (rnd() < 0.2 ? 1 : 0) : 0;
    const t = d && rnd() < 0.15 ? 1 : 0;
    const q = t && rnd() < 0.2 ? 1 : 0;
    return { doubleKills: d, tripleKills: t, quadraKills: q, pentaKills: q && rnd() < 0.3 ? 1 : 0, largestMultiKill: q ? 4 : t ? 3 : d ? 2 : 1 };
  };
  const rows: Array<typeof accountMatches.$inferInsert> = [];
  const details: Array<typeof matchDetails.$inferInsert> = [];
  for (let i = 0; i < GAMES; i++) {
    const matchId = `EUW1_AUDIT_${i}`;
    matchIds.push(matchId);
    const gameCreation = NOW - (i + 1) * 3_600_000;
    const m = i % NAMES.length;
    const pace = m === BLOODY ? 1.8 : 1;
    const [role, position, champion] = ROLES[m]!;
    const seats: MatchParticipantDetail[] = [];
    const kills = 3 + Math.floor(rnd() * 8);
    seats.push(part(`puuid-${NAMES[m]!.toLowerCase()}`, 100, position, champion, kills, counters(0.45)));
    rows.push({ accountId: accounts[m]!, matchId, gameCreation, queueId: i % 7 === 0 ? 400 : 420, championId: champion, role, win: true, patch: `${season}.20`, gameDuration: 1500 + (i % 9) * 60, kills, deaths: 3, assists: 5, cs: 200, damage: 20_000, visionScore: 15 });
    // Now and then a teammate member on the same side (a member, never in the comparison).
    const mate = i % 10 === 3 ? (m + 1) % NAMES.length : null;
    if (mate !== null) {
      const [mRole, mPosition, mChampion] = ROLES[mate]!;
      seats.push(part(`puuid-${NAMES[mate]!.toLowerCase()}`, 100, mPosition, mChampion, 2, counters(0.3)));
      rows.push({ accountId: accounts[mate]!, matchId, gameCreation, queueId: i % 7 === 0 ? 400 : 420, championId: mChampion, role: mRole, win: true, patch: `${season}.20`, gameDuration: 1500 + (i % 9) * 60, kills: 2, deaths: 3, assists: 9, cs: 100, damage: 9_000, visionScore: 30 });
    }
    const taken = new Set(seats.map((s) => s.position));
    for (const p of POSITIONS) if (!taken.has(p)) seats.push(part(`o-${i}-a-${p}`, 100, p, `Ally${p}`, 2 + Math.floor(rnd() * 6 * pace), counters(0.3 * pace)));
    for (const p of POSITIONS) seats.push(part(`o-${i}-e-${p}`, 200, p, `Foe${p}${i % 3}`, 2 + Math.floor(rnd() * 6 * pace), counters(0.3 * pace)));
    if (i % 25 === 0) seats[seats.length - 1] = part("", 200, "", "", 0, undefined, { removed: true, championId: null, position: null });
    const sideKills = (t: number) => seats.filter((s) => s.teamId === t).reduce((n, s) => n + s.kills, 0);
    details.push({ matchId, platform: "euw1", queueId: i % 7 === 0 ? 400 : 420, gameCreation, gameDuration: 1500 + (i % 9) * 60, gameVersion: `${season}.20.1`, teams: [{ teamId: 100, win: true, bans: [], objectives: { champion: sideKills(100) } }, { teamId: 200, win: false, bans: [], objectives: { champion: sideKills(200) } }], participants: seats });
  }
  await db.insert(accountMatches).values(rows);
  for (let i = 0; i < details.length; i += 100) await db.insert(matchDetails).values(details.slice(i, i + 100));
  // The sync copies each game's figures from its record (counts included), as it does in production.
  await summariseMatches(db, { accountIds: accounts, maxBatches: 50 });
  invalidateLeaderboardCache();
  invalidateMultikillBaselineCache();
  invalidateMultikillCountingCache();
}, 120_000);
afterAll(async () => {
  await handle?.close();
});

describe("the multikill fairness check", () => {
  it("scores exactly the page's board with the production model, and compares every model on it", async () => {
    const db = handle.db;
    const data = await loadLeaderboardData(db, teamId);
    const baseline = await loadMultikillBaseline(db, teamId, data, recordsSeason(data, {}));
    const board = buildLeaderboardsView(data, {}, null, { multikillBaseline: baseline, now: new Date(NOW) }).records.multikills;
    const ranked = board.rows.filter((r) => r.status === "ranked");
    expect(ranked).toHaveLength(5);
    const run = await runMultikillAudit(db, { now: new Date(NOW) });
    expect(run.summary.scope).toMatchObject({ membersRanked: 5, comparisonGames: baseline.all.games, ready: true, counting: baseline.reading.shown ? baseline.reading.rule : "assumed nested" });
    expect(run.summary.m0MatchesProduction).toBe(true);
    // The same members, in the board's order, with the board's scores.
    expect(run.rankedIds).toEqual(ranked.map((r) => r.playerId));
    const m0 = run.evaluation.models.M0!.scores;
    expect(m0.map((s) => String(Math.round(s)))).toEqual(ranked.map((r) => r.score));
    expect(Object.keys(run.summary.models)).toHaveLength(12);
    expect(run.summary.decision.outcome).toMatch(/^(keep|candidate|inconclusive)$/);
    // The bloodier member's games show it: the other players in them made more multikills than usual.
    const eve = run.rankedIds.indexOf(ids[BLOODY]!);
    const own = run.evaluation.environment.ownGames.map((o) => o.both);
    expect(own[eve]).toBeGreaterThan(1.1);
    expect(Math.max(...own.filter((_, i) => i !== eve))).toBeLessThan(own[eve]!);
    expect(run.summary.environment.ownGamesFactor!.max).toBeCloseTo(own[eve]!, 2);
  });

  it("reads the same comparison players as the page, and both sides' kills of every game in the order asked", async () => {
    const db = handle.db;
    const data = await loadLeaderboardData(db, teamId);
    const baseline = await loadMultikillBaseline(db, teamId, data, recordsSeason(data, {}));
    const members = NAMES.map((n, i) => ({ puuid: `puuid-${n.toLowerCase()}`, member: i }));
    const answer = await readMultikillAudit(db, matchIds, members, true);
    const a = answer.aggregates;
    // Every comparison player once by queue, as many as the page's comparison counts.
    expect(a.byQueue.reduce((n, r) => n + r.games, 0)).toBe(baseline.all.games);
    expect(a.byKills.reduce((n, r) => n + r.games, 0)).toBe(baseline.all.games);
    expect(new Set(a.byQueue.map((r) => r.queueId))).toEqual(new Set([400, 420]));
    // Both sides' champion kills, as the records' team objectives say, game by game in the order asked.
    const [first] = await db.select({ teams: matchDetails.teams }).from(matchDetails).where(sql`${matchDetails.matchId} = ${matchIds[7]!}`);
    expect(answer.games).toHaveLength(GAMES);
    expect(answer.games[7]!.gameKills).toBe(first!.teams[0]!.objectives.champion! + first!.teams[1]!.objectives.champion!);
    expect(new Set(answer.games.map((g) => g.half))).toEqual(new Set([0, 1]));
    // Each member game's lane opponent (the enemy on the member's position): about one a game.
    const opponentGames = a.opponents.reduce((n, c) => n + c.games, 0);
    expect(opponentGames).toBeGreaterThan(GAMES * 0.9);
    expect(a.opponents.every((c) => c.member >= 0 && c.member < NAMES.length)).toBe(true);
    // The members' own games: allies and opponents apart, never a member.
    expect(a.ownGames.some((c) => c.ally) && a.ownGames.some((c) => !c.ally)).toBe(true);
    expect(JSON.stringify(answer)).not.toMatch(/puuid-|EUW1_AUDIT|o-\d+-/);
    expect(a.paceMean).toBeGreaterThan(0);
  });

  it("as a job: changes nothing, gives the same answer twice, and prints no name, id, PUUID or game", async () => {
    const db = handle.db;
    const before = await tableCounts(db);
    const first = await runJob(db, "multikill-audit", "test");
    const second = await runJob(db, "multikill-audit", "test");
    expect(await tableCounts(db)).toEqual(before);
    expect(first.ok).toBe(true);
    expect(first.degraded).toBe(false);
    const strip = (s: Record<string, unknown> | undefined) => JSON.stringify({ ...s, cost: undefined, logs: undefined });
    expect(strip(second.summary)).toEqual(strip(first.summary));
    const text = JSON.stringify(first);
    for (const id of ids) expect(text).not.toContain(id);
    for (const n of NAMES) expect(text).not.toMatch(new RegExp(`\\b${n}\\b`));
    expect(text).not.toMatch(/puuid|EUW1_|o-\d+-|#X|#T/i);
  }, 60_000);
});
