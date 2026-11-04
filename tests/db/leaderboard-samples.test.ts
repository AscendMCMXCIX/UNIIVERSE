import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, isNull } from "drizzle-orm";
import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";
import { accountMatches, matchDetails, riotAccounts, type MatchParticipantDetail } from "@/server/db/schema";
import { createPlayer, getOrCreateTeam, setTeamMember } from "@/server/repositories/team";
import { invalidateLeaderboardCache, loadLeaderboardData, readLeaderboardGames } from "@/server/leaderboards/service";
import { runJob } from "@/server/jobs";
import { FixtureStaticProvider } from "@/server/riot/static/fixture";
import { syncStaticData } from "@/server/riot/static/sync";

/*
  The proposed Recent performance boards (docs/LEADERBOARDS_MODEL.md) are checked against the
  team's own games before the page switches to them: the data audit reports how many members each
  board would rank. These tests use synthetic accounts and games (no Riot request is made): the
  audit's games are the boards' own (one per match per player, members only), its read changes
  nothing, and its counts follow the model's window.
*/

let handle: DbHandle;
let teamId: string;
let ace: string;
let aceMain: string;
let aceSmurf: string;
let bea: string;
let beaAcc: string;

const DAY = 86_400_000;
const now = Date.now();

function participant(puuid: string, teamId: number, over: Partial<MatchParticipantDetail> = {}): MatchParticipantDetail {
  return { puuid, name: null, teamId, championId: null, championKey: 0, champLevel: 15, position: null, win: teamId === 100, kills: 2, deaths: 3, assists: 4, cs: 150, gold: 10000, damage: 15000, damageTaken: 18000, vision: 20, wardsPlaced: 8, items: null, spells: null, runes: null, ...over };
}

async function account(playerId: string, puuid: string, label: string) {
  const [row] = await handle.db.insert(riotAccounts).values({ ownerType: "player", playerId, gameName: puuid, tagLine: "TEST", platform: "euw1", puuid, label, lastSyncAt: new Date(now) }).returning({ id: riotAccounts.id });
  return row!.id;
}

/** n games, one a day from `start` days ago (newest first). */
async function games(accountId: string, prefix: string, n: number, start: number, over: Partial<typeof accountMatches.$inferInsert> = {}) {
  await handle.db.insert(accountMatches).values(
    Array.from({ length: n }, (_, i) => ({ accountId, matchId: `${prefix}_${i}`, gameCreation: now - (start + i) * DAY - 3_600_000, queueId: 420, championId: "Riven", role: "TOP", win: i % 2 === 0, patch: "16.21", gameDuration: 1800, kills: 5, deaths: 2, assists: 6, cs: 210, damage: 24000, visionScore: 18, ...over })),
  );
}

beforeAll(async () => {
  handle = await testDb();
  const db = handle.db;
  await syncStaticData(db, new FixtureStaticProvider(), { fingerprint: false });
  teamId = (await getOrCreateTeam(db)).id;
  ace = (await createPlayer(db, teamId, { displayName: "Ace", primaryRole: "TOP", primaryPool: ["Riven"] })).id;
  bea = (await createPlayer(db, teamId, { displayName: "Bea", primaryRole: "JUNGLE", primaryPool: ["Viego"] })).id;
  const personal = (await createPlayer(db, teamId, { displayName: "Solo user", primaryRole: "MID", primaryPool: ["Ahri"] })).id;
  await setTeamMember(db, teamId, personal, false);

  aceMain = await account(ace, "puuid-ace-main", "main");
  aceSmurf = await account(ace, "puuid-ace-smurf", "smurf");
  beaAcc = await account(bea, "puuid-bea", "main");
  // Ace: 21 top games in the last 21 days, ACE_0 recorded on both accounts (one match, counted once).
  await games(aceMain, "ACE", 21, 0);
  await db.insert(accountMatches).values({ accountId: aceSmurf, matchId: "ACE_0", gameCreation: now - 3_600_000, queueId: 420, championId: "Riven", role: "TOP", win: true, patch: "16.21", gameDuration: 1800, kills: 5, deaths: 2, assists: 6, cs: 210, damage: 24000, visionScore: 18 });
  // Bea: 12 Flex jungle games in the last 60 days, 5 more before that, and a remake.
  await games(beaAcc, "BEA", 12, 1, { queueId: 440, role: "JUNGLE", championId: "Viego" });
  await games(beaAcc, "BEA_OLD", 5, 70, { queueId: 440, role: "JUNGLE", championId: "Viego" });
  await games(beaAcc, "BEA_REMAKE", 1, 2, { queueId: 440, role: "JUNGLE", championId: "Viego", gameDuration: 200 });
  // Someone who is not a team member plays plenty; the boards never count them.
  await games(await account(personal, "puuid-personal", "main"), "SOLO", 25, 0, { role: "MID", championId: "Ahri" });
  // ACE_1's details are stored but not yet copied onto the game: the page's loader copies them, the audit's read does not.
  await db.insert(matchDetails).values({ matchId: "ACE_1", platform: "euw1", queueId: 420, gameCreation: now - DAY - 3_600_000, gameDuration: 1800, gameVersion: "16.21.1", teams: [], participants: [participant("puuid-ace-main", 100, { gold: 12345 })] });
  invalidateLeaderboardCache();
}, 60_000);
afterAll(async () => {
  await handle.close();
});

const unsummarised = async () => (await handle.db.select({ id: accountMatches.matchId }).from(accountMatches).where(and(eq(accountMatches.matchId, "ACE_1"), isNull(accountMatches.summarisedAt)))).length;

describe("the data audit's read of the members' games", () => {
  it("counts one game per match per player, members only, and copies nothing", async () => {
    const playerOf = new Map([[aceMain, ace], [aceSmurf, ace], [beaAcc, bea]]);
    const read = await readLeaderboardGames(handle.db, [aceMain, aceSmurf, beaAcc], playerOf);
    expect(read.filter((g) => g.playerId === ace)).toHaveLength(21);
    expect(read.filter((g) => g.playerId === bea)).toHaveLength(18);
    expect(await unsummarised()).toBe(1);
    // From a start time, only the games since then.
    expect(await readLeaderboardGames(handle.db, [beaAcc], playerOf, now - 60 * DAY)).toHaveLength(13);
  });

  it("reads the same games as the page", async () => {
    const before = await readLeaderboardGames(handle.db, [aceMain, aceSmurf, beaAcc], new Map([[aceMain, ace], [aceSmurf, ace], [beaAcc, bea]]));
    const page = await loadLeaderboardData(handle.db, teamId); // copies ACE_1's details first
    expect(await unsummarised()).toBe(0);
    const key = (g: { playerId: string; matchId: string }) => `${g.playerId}|${g.matchId}`;
    expect(page.games.map(key).sort()).toEqual(before.map(key).sort());
    const after = await readLeaderboardGames(handle.db, [aceMain, aceSmurf, beaAcc], new Map([[aceMain, ace], [aceSmurf, ace], [beaAcc, bea]]));
    expect(after).toEqual(page.games);
  });
});

describe("data audit: leaderboard samples", () => {
  it("reports how many members each proposed board would rank, anonymously", async () => {
    const result = await runJob(handle.db, "data-audit", "cli");
    expect(result.ok).toBe(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- a loose JSON report
    const s = (result.summary as Record<string, any>).leaderboardSamples;
    expect(s.window).toEqual({ games: 20, provisionalFrom: 10, days: 60 });
    expect(s.members).toBe(2);
    expect(s.modes.all.boards.overall).toMatchObject({ established: 1, provisional: 1, insufficient: 0, tenOrMore: 2 });
    expect(s.modes.all.boards.TOP).toMatchObject({ established: 1, provisional: 0, insufficient: 1 });
    expect(s.modes.all.boards.JUNGLE).toMatchObject({ established: 0, provisional: 1, insufficient: 1 });
    // Ace's games are Solo/Duo, Bea's Flex: both are ranked.
    expect(s.modes.ranked.boards.overall).toMatchObject({ established: 1, provisional: 1 });
    const counts = s.modes.all.byMember.map((m: Record<string, unknown>) => [m.overall, m.TOP, m.JUNGLE]).sort();
    expect(counts).toEqual([[12, 0, 12], [21, 21, 0]]);
    // Anonymous: labels only, no names or ids.
    const text = JSON.stringify(s);
    for (const secret of ["Ace", "Bea", ace, bea, "puuid-ace-main"]) expect(text).not.toContain(secret);
    expect(s.modes.all.byMember.every((m: { member: string }) => /^p\d+$/.test(m.member))).toBe(true);
  });
});
