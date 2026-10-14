import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";
import { rankedMatches, rankedParticipants } from "@/server/db/schema";
import { FixtureStaticProvider } from "@/server/riot/static/fixture";
import { syncStaticData } from "@/server/riot/static/sync";
import { aggregateRankedMatches } from "@/server/ingestion/aggregate";
import { invalidateStatsCache } from "@/server/stats/loader";
import { createPlayer, getOrCreateTeam, setLineup } from "@/server/repositories/team";
import { runJob } from "@/server/jobs";
import { getCurrentPatch } from "@/server/repositories/champions";
import fixture from "@/server/riot/fixtures/champions.fixture.json";

/* The data sufficiency audit reads everything and writes nothing but its own run record. */

const keyOf = (id: string) => fixture.champions.find((c) => c.id === id)!.key;
const POSITIONS = ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"];
const BLUE = ["Gwen", "Viego", "Orianna", "Jinx", "Lulu"];
const RED = ["Ornn", "LeeSin", "Ahri", "Kaisa", "Nautilus"];

let handle: DbHandle;
let patch = "15.19";

async function insertGame(i: number, blueWins: boolean) {
  const matchId = `TEST_${i}`;
  await handle.db.insert(rankedMatches).values({ matchId, platform: "euw1", gameVersion: `${patch}.1`, patch, queueId: 420, tierBand: "DIAMOND", gameCreation: Date.now() - i * 60_000, gameDuration: 1800, winningTeamId: blueWins ? 100 : 200 });
  await handle.db.insert(rankedParticipants).values([
    ...BLUE.map((c, j) => ({ matchId, puuid: `b${j}-${i}`, teamId: 100, championKey: keyOf(c), championId: c, position: POSITIONS[j]!, win: blueWins, kills: 1, deaths: 1, assists: 1 })),
    ...RED.map((c, j) => ({ matchId, puuid: `r${j}-${i}`, teamId: 200, championKey: keyOf(c), championId: c, position: POSITIONS[j]!, win: !blueWins, kills: 1, deaths: 1, assists: 1 })),
  ]);
}

async function counts() {
  const r = await handle.db.execute(sql`SELECT (SELECT count(*) FROM ranked_matches) AS m, (SELECT count(*) FROM ranked_matches WHERE aggregated_at IS NULL) AS waiting, (SELECT count(*) FROM champion_matchups) AS mu, (SELECT count(*) FROM drafts) AS d, (SELECT count(*) FROM players) AS p`);
  return ((r as { rows?: unknown[] }).rows ?? r) as unknown[];
}

beforeAll(async () => {
  handle = await testDb();
  await syncStaticData(handle.db, new FixtureStaticProvider(), { fingerprint: false });
  patch = (await getCurrentPatch(handle.db))?.patch ?? patch;
  const team = await getOrCreateTeam(handle.db);
  const top = await createPlayer(handle.db, team.id, { displayName: "Top", primaryRole: "TOP", primaryPool: ["Gwen", "Jax"] }, team.poolLimits);
  const jg = await createPlayer(handle.db, team.id, { displayName: "Jg", primaryRole: "JUNGLE", primaryPool: ["Viego"] }, team.poolLimits);
  await setLineup(handle.db, team.id, { TOP: top.id, JUNGLE: jg.id });
  for (let i = 0; i < 30; i++) await insertGame(i, i % 3 !== 0);
  await aggregateRankedMatches(handle.db);
  // Games stored after the last aggregation are the held-out sample.
  for (let i = 30; i < 40; i++) await insertGame(i, i % 2 === 0);
  invalidateStatsCache();
}, 60_000);
afterAll(async () => {
  await handle.close();
});

describe("data sufficiency audit", () => {
  it("reports evidence, scenarios and a held-out check without changing any data", async () => {
    const before = await counts();
    const result = await runJob(handle.db, "data-sufficiency", "cli");
    expect(result.ok).toBe(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- a loose JSON report
    const s = result.summary as Record<string, any>;
    expect(s.collection.byPatch[0]).toMatchObject({ patch, games: 40, aggregated: 30, waiting: 10 });
    expect(s.evidenceInRecentDrafts.games).toBe(40);
    expect(s.evidenceInRecentDrafts.laneMatchups.verdict).toMatch(/Sufficient|Limited|Insufficient/);
    expect(s.heldOutCheck.games).toBe(10);
    expect(s.heldOutCheck.strengthAndMatchups.games).toBe(10);
    // Leave-one-out covers the folded games of the current patch.
    expect(s.leaveOneOut.games).toBe(30);
    expect(s.leaveOneOut.strengthMatchupsAndPairs.games).toBe(30);
    // Scenarios run on in-memory fixtures; placeholders fill the roles nobody plays.
    expect(s.lineup.placeholderRoles).toEqual(["MID", "ADC", "SUPPORT"]);
    expect(s.scenarios.blindFlexFirstPick.kind).toBe("pick");
    expect(s.scenarios.tournamentFirstBan.kind).toBe("ban");
    expect(s.scenarios.emergencyTopPoolGone.error).toBeUndefined();
    expect(await counts()).toEqual(before);
  });
});
