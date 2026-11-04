import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";
import { accountMatches, matchDetails, matchTimelines, type MatchFrames, type MatchParticipantDetail } from "@/server/db/schema";
import { FixtureStaticProvider } from "@/server/riot/static/fixture";
import { syncStaticData } from "@/server/riot/static/sync";
import { createPlayer, getOrCreateTeam } from "@/server/repositories/team";
import { addAccount } from "@/server/accounts/repository";
import { forgetMatchupLanes, getPlayerMatchups } from "@/server/players/matchups";
import { forgetAccountRows } from "@/server/accounts/account-rows";
import { processEgress } from "@/server/db/egress";
import { clearLocalCaches } from "@/server/observability/cache";

/*
  The champion window reads each game's lane in one query that matches the players in Postgres and
  returns only the two lane players' frames (server/players/matchups.ts). Every timeline status
  stays as before; a lane still waiting for its timeline is read again, never kept; on Postgres, the
  bytes are a fraction of the whole records, and a second open reads no lane at all.
*/

let handle: DbHandle;
let playerId: string;
const onPostgres = !!process.env.TEST_DATABASE_URL;
const DAY = 86_400_000;
const part = (puuid: string, teamId: number, championId: string, position: string, win: boolean): MatchParticipantDetail => ({ puuid, name: `Name of ${puuid}`, teamId, championId, championKey: 0, champLevel: 14, position, win, kills: 3, deaths: 3, assists: 3, cs: 150, gold: 10000, damage: 15000, damageTaken: 15000, vision: 20, wardsPlaced: 8, items: [3078, 3053, 3047, 6333, 3065, 3742, 3340], spells: [4, 12], runes: { primary: 8000, sub: 8400, perks: [8010, 9111, 9104, 8299, 8473, 8451] } as unknown as MatchParticipantDetail["runes"] });
function frames(minutes: number, players: string[]): MatchFrames {
  const t = Array.from({ length: minutes + 1 }, (_, i) => i * 60_000 + (i ? 700 : 0));
  const series = (gpm: number) => ({ g: t.map((ms) => Math.round(500 + (gpm * ms) / 60_000)), x: t.map((ms) => Math.round((380 * ms) / 60_000)), c: t.map((ms) => Math.floor((7 * ms) / 60_000)) });
  return { t, p: Object.fromEntries(players.map((p, i) => [p, series(380 + i * 10)])) };
}
const ten = (me: string, n: number) => {
  const positions = ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"];
  return [...positions.map((pos, i) => part(i === 0 ? me : `ally-${n}-${i}`, 100, i === 0 ? "Gwen" : "Ahri", pos, true)), ...positions.map((pos, i) => part(`enemy-${n}-${i}`, 200, i === 0 ? "Nasus" : "Lux", pos, false))];
};

beforeAll(async () => {
  handle = await testDb();
  const db = handle.db;
  await syncStaticData(db, new FixtureStaticProvider(), { fingerprint: false });
  const team = await getOrCreateTeam(db);
  playerId = (await createPlayer(db, team.id, { displayName: "Lane reader", primaryRole: "TOP", primaryPool: ["Gwen"] })).id;
  const account = (await addAccount(db, { ownerType: "player", playerId, riotId: "LaneReader#OCE", platform: "oc1", puuid: "me" })).id;
  const now = Date.now();
  for (let n = 1; n <= 12; n++) {
    const id = `OC1_L${n}`;
    await db.insert(accountMatches).values({ accountId: account, matchId: id, gameCreation: now - n * DAY, queueId: 420, championId: "Gwen", role: "TOP", win: n % 2 === 0, enemyChampionId: "Nasus", patch: "16.20", gameDuration: 1800, kills: 4, deaths: 2, assists: 5, cs: 200 });
    const parts = ten("me", n);
    await db.insert(matchDetails).values({ matchId: id, platform: "oc1", queueId: 420, gameCreation: now - n * DAY, gameDuration: 1800, gameVersion: "16.20.1", teams: [], participants: parts });
    // L2: no timeline yet. L3: a timeline without the lane opponent's frames. The rest: all ten players.
    if (n === 2) continue;
    const who = n === 3 ? parts.map((p) => p.puuid).filter((p) => p !== `enemy-${n}-0`) : parts.map((p) => p.puuid);
    await db.insert(matchTimelines).values({ matchId: id, platform: "oc1", participants: [], frames: frames(30, who) });
  }
}, 60_000);
afterAll(async () => {
  await handle.close();
});

const open = () => getPlayerMatchups(handle.db, playerId, { account: null, mode: "all", champion: "Gwen", vs: "Nasus", exact: true });

describe("the champion window's lane read", () => {
  it("keeps every timeline status, and reads a waiting lane again once its timeline arrives", async () => {
    const first = await open();
    const status = (id: string) => first.detail!.matches.find((m) => m.matchId === id)!.timeline;
    expect(status("OC1_L1")).toBe("frames");
    expect(status("OC1_L2")).toBe("pending");
    expect(status("OC1_L3")).toBe("unavailable");
    expect(first.detail!.timelines).toEqual({ frames: 10, pending: 1, unavailable: 1, noDetails: 0 });
    // The timeline arrives (the backfill stores it): the next open shows it.
    await handle.db.insert(matchTimelines).values({ matchId: "OC1_L2", platform: "oc1", participants: [], frames: frames(30, ten("me", 2).map((p) => p.puuid)) });
    const second = await open();
    expect(second.detail!.matches.find((m) => m.matchId === "OC1_L2")!.timeline).toBe("frames");
    expect(second.detail!.timelines).toEqual({ frames: 11, pending: 0, unavailable: 1, noDetails: 0 });
    // Gold at 10:00 (frames are 0.7 s late, so read between two): me at 380 gold/min, the lane opponent at 430.
    expect(second.detail!.matches.find((m) => m.matchId === "OC1_L1")!.at.find((a) => a.minute === 10)!.gold).toBeCloseTo(-500, 0);
  });

  it.runIf(onPostgres)("sends a fraction of the whole records, and nothing for lanes already read", async () => {
    const ids = Array.from({ length: 12 }, (_, i) => `OC1_L${i + 1}`);
    let before = processEgress().bytes;
    await handle.db.select({ participants: matchDetails.participants }).from(matchDetails).where(inArray(matchDetails.matchId, ids));
    await handle.db.select({ frames: matchTimelines.frames }).from(matchTimelines).where(inArray(matchTimelines.matchId, ids));
    const whole = processEgress().bytes - before;

    // A fresh instance: the games and every lane are read.
    forgetAccountRows(handle.db);
    forgetMatchupLanes(handle.db);
    before = processEgress().bytes;
    await open();
    const cold = processEgress().bytes - before;
    expect(cold).toBeLessThan(whole / 3);

    // The same window again: the lanes are kept; only the account, the season and one fingerprint row are read.
    before = processEgress().bytes;
    const rowsBefore = processEgress().rows;
    await open();
    expect(processEgress().rows - rowsBefore).toBeLessThanOrEqual(3);
    expect(processEgress().bytes - before).toBeLessThan(whole / 20);
    if (process.env.EGRESS_TEST_PRINT) console.log(`whole records ${whole} B; champion window cold ${cold} B, warm ${processEgress().bytes - before} B`);
  });

  it("forgets the lanes it kept when an erasure clears this instance's caches", async () => {
    // Kept: OC1_L1's lane, with the lane opponent's frames.
    expect((await open()).detail!.matches.find((m) => m.matchId === "OC1_L1")!.timeline).toBe("frames");
    // Erasing the lane opponent deletes their per-minute frames (privacy/erasure.ts), then clears
    // every local cache (afterErasure in actions/privacy.ts). The kept lane must go with them.
    const [row] = await handle.db.select({ frames: matchTimelines.frames }).from(matchTimelines).where(eq(matchTimelines.matchId, "OC1_L1"));
    const p = Object.fromEntries(Object.entries(row!.frames!.p).filter(([puuid]) => puuid !== "enemy-1-0"));
    await handle.db.update(matchTimelines).set({ frames: { t: row!.frames!.t, p } }).where(eq(matchTimelines.matchId, "OC1_L1"));
    clearLocalCaches();
    const after = (await open()).detail!.matches.find((m) => m.matchId === "OC1_L1")!;
    expect(after.timeline).toBe("unavailable");
    expect(after.curves.gold).toEqual([]);
  });
});
