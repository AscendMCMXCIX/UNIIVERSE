import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";
import { accountMatches, matchDetails, matchTimelines, riotAccounts, type MatchFrames, type MatchParticipantDetail } from "@/server/db/schema";
import { FixtureStaticProvider } from "@/server/riot/static/fixture";
import { syncStaticData } from "@/server/riot/static/sync";
import { createPlayer, getOrCreateTeam } from "@/server/repositories/team";
import { addAccount } from "@/server/accounts/repository";
import { getPlayerMatchups, parseMatchupFilter } from "@/server/players/matchups";
import { backfillTimelines, timelineCoverage } from "@/server/accounts/timeline-backfill";
import { RiotApiClient } from "@/server/riot/api/client";
import { RateLimiter } from "@/server/riot/api/rate-limiter";
import { runJob } from "@/server/jobs";

/*
  Matchups on stored games: the lane opponent is the enemy in the same assigned position; diffs come
  from both players' timeline frames read at exact minutes; games without a timeline are counted,
  not guessed; the Main account is the default; nothing about other players is sent. The backfill
  fetches what is missing, newest first, keeps build-order rows, records unavailable timelines and
  stops at the first refusal.
*/

let handle: DbHandle;
let playerId: string;
let mainId: string;
let altId: string;
const DAY = 86_400_000;

const part = (puuid: string, teamId: number, championId: string, position: string | null, win: boolean): MatchParticipantDetail => ({ puuid, name: null, teamId, championId, championKey: 0, champLevel: 14, position, win, kills: 3, deaths: 3, assists: 3, cs: 150, gold: 10000, damage: 15000, damageTaken: 15000, vision: 20, wardsPlaced: 8, items: null, spells: null, runes: null });
/** Frames a little over a minute apart up to `minutes`, the last one at the end of the game. */
function frames(minutes: number, me: string, them: string, myGpm: number, theirGpm: number): MatchFrames {
  const t = [...Array.from({ length: minutes + 1 }, (_, i) => i * 60_000 + (i ? 700 : 0)), minutes * 60_000 + 25_000];
  const series = (gpm: number) => ({ g: t.map((ms) => Math.round(500 + (gpm * ms) / 60_000)), x: t.map((ms) => Math.round((380 * ms) / 60_000)), c: t.map((ms) => Math.floor((7 * ms) / 60_000)) });
  return { t, p: { [me]: series(myGpm), [them]: series(theirGpm) } };
}

beforeAll(async () => {
  handle = await testDb();
  const db = handle.db;
  await syncStaticData(db, new FixtureStaticProvider(), { fingerprint: false });
  const team = await getOrCreateTeam(db);
  playerId = (await createPlayer(db, team.id, { displayName: "Laner", primaryRole: "TOP", primaryPool: ["Gwen"] })).id;
  mainId = (await addAccount(db, { ownerType: "player", playerId, riotId: "Laner#OCE", platform: "oc1", puuid: "me-main" })).id;
  altId = (await addAccount(db, { ownerType: "player", playerId, riotId: "LanerAlt#OCE", platform: "oc1", puuid: "me-alt" })).id;
  await db.update(riotAccounts).set({ label: "main" }).where(eq(riotAccounts.id, mainId));
  await db.update(riotAccounts).set({ label: "alt" }).where(eq(riotAccounts.id, altId));
  const now = Date.now();
  type G = { id: string; account: string; puuid: string; queue: number; champ: string; enemy: string | null; win: boolean; age: number; duration?: number; ambiguous?: boolean; frames?: MatchFrames | null };
  const games: G[] = [
    { id: "OC1_1", account: mainId, puuid: "me-main", queue: 420, champ: "Gwen", enemy: "Nasus", win: true, age: 1, duration: 1900, frames: frames(31, "me-main", "opp-1", 430, 390) },
    { id: "OC1_2", account: mainId, puuid: "me-main", queue: 420, champ: "Gwen", enemy: "Nasus", win: false, age: 2, duration: 1110, frames: frames(18, "me-main", "opp-2", 380, 410) },
    { id: "OC1_3", account: mainId, puuid: "me-main", queue: 440, champ: "Gwen", enemy: "Nasus", win: true, age: 3, duration: 1700 },
    { id: "OC1_4", account: altId, puuid: "me-alt", queue: 420, champ: "Gwen", enemy: "Nasus", win: true, age: 4, duration: 1800, frames: frames(30, "me-alt", "opp-4", 400, 400) },
    { id: "OC1_5", account: mainId, puuid: "me-main", queue: 420, champ: "Gwen", enemy: "Darius", win: false, age: 5, duration: 1600 },
    // Two enemies Riot placed in the same position: no lane opponent is named from the details.
    { id: "OC1_6", account: mainId, puuid: "me-main", queue: 420, champ: "Gwen", enemy: "Nasus", win: false, age: 6, duration: 1600, ambiguous: true },
    // A remake and a game without a named opponent are not matchups.
    { id: "OC1_7", account: mainId, puuid: "me-main", queue: 420, champ: "Gwen", enemy: "Nasus", win: false, age: 7, duration: 200 },
    { id: "OC1_8", account: mainId, puuid: "me-main", queue: 420, champ: "Jax", enemy: null, win: true, age: 8, duration: 1600 },
  ];
  for (const g of games) {
    await db.insert(accountMatches).values({ accountId: g.account, matchId: g.id, gameCreation: now - g.age * DAY, queueId: g.queue, championId: g.champ, role: "TOP", win: g.win, enemyChampionId: g.enemy, patch: "16.20", gameDuration: g.duration ?? 1700, kills: 4, deaths: 2, assists: 5, cs: 200 });
    const opp = `opp-${g.id.slice(4)}`;
    const parts = [part(g.puuid, 100, g.champ, "TOP", g.win), part("ally", 100, "Ahri", "MIDDLE", g.win), part(opp, 200, g.enemy ?? "Garen", "TOP", !g.win), part("enemy-mid", 200, "Lux", g.ambiguous ? "TOP" : "MIDDLE", !g.win)];
    await db.insert(matchDetails).values({ matchId: g.id, platform: "oc1", queueId: g.queue, gameCreation: now - g.age * DAY, gameDuration: g.duration ?? 1700, gameVersion: "16.20.1", teams: [], participants: parts });
    if (g.frames !== undefined) await db.insert(matchTimelines).values({ matchId: g.id, platform: "oc1", participants: [{ puuid: g.puuid, purchases: [[1000, 1055]], skills: [1] }], frames: g.frames });
  }
}, 60_000);
afterAll(async () => {
  await handle.close();
});

describe("Matchups for a profile", () => {
  it("defaults to the Main account and lists only champions with a named lane opponent, remakes left out", async () => {
    const m = await getPlayerMatchups(handle.db, playerId, { account: null, mode: "all", champion: null, vs: null });
    expect(m.account).toBe(mainId);
    expect(m.accounts.find((a) => a.main)?.id).toBe(mainId);
    expect(m.games).toBe(6);
    expect(m.gamesWithOpponent).toBe(5);
    expect(m.champions).toEqual([{ championId: "Gwen", games: 5, wins: 2 }]);
    expect(m.opponents.map((o) => [o.championId, o.games, o.wins])).toEqual([
      ["Nasus", 4, 2],
      ["Darius", 1, 0],
    ]);
    expect(m).toMatchObject({ champion: "Gwen", vs: "Nasus" });
  });

  it("gives the record, where the games came from, and the lane from timestamps, with every sample counted", async () => {
    const d = (await getPlayerMatchups(handle.db, playerId, { account: null, mode: "all", champion: "Gwen", vs: "Nasus" })).detail!;
    expect(d).toMatchObject({ games: 4, wins: 2 });
    expect(d.byQueue).toEqual([
      { label: "Ranked Solo/Duo", games: 3, wins: 1 },
      { label: "Ranked Flex", games: 1, wins: 1 },
    ]);
    expect(d.byAccount).toEqual([{ label: "Laner#OCE", games: 4, wins: 2 }]);
    expect(d.timelines).toEqual({ frames: 2, pending: 1, unavailable: 0, noDetails: 1 });
    const at = (m: number) => d.checkpoints.find((c) => c.minute === m)!;
    // 10:00: +400 in game 1 (40 gold/min × 10) and −300 in game 2; game 2 ended at 18 minutes.
    expect(at(10)).toMatchObject({ games: 2, aheadInGold: 1 });
    expect(at(10).goldMean).toBeCloseTo(50, -1);
    expect(at(20)).toMatchObject({ games: 1, aheadInGold: 1 });
    expect(at(20).goldMean).toBeCloseTo(800, -1);
    // Two games is too few for any sentence about a pattern.
    expect(d.notes).toEqual([]);
    const g1 = d.matches.find((x) => x.matchId === "OC1_1")!;
    expect(g1.timeline).toBe("frames");
    expect(g1.curves.gold).toHaveLength(30);
    expect(g1.curves.xp).toHaveLength(30);
    expect(g1.opponentId).toBe("Nasus");
    expect(d.matches.find((x) => x.matchId === "OC1_2")!.at.find((a) => a.minute === 20)!.gold).toBeNull();
    expect(d.matches.find((x) => x.matchId === "OC1_6")!.timeline).toBe("no-details");
    // Nothing identifying another player (or the profile's own PUUIDs) is in the data.
    expect(JSON.stringify(d)).not.toMatch(/opp-|me-main|me-alt|enemy-mid|ally/);
  });

  it("other linked accounts on request, and the game-mode filter", async () => {
    const all = await getPlayerMatchups(handle.db, playerId, { account: "all", mode: "all", champion: "Gwen", vs: "Nasus" });
    expect(all.account).toBe("all");
    expect(all.detail!.byAccount).toEqual([
      { label: "Laner#OCE", games: 4, wins: 2 },
      { label: "LanerAlt#OCE", games: 1, wins: 1 },
    ]);
    const alt = await getPlayerMatchups(handle.db, playerId, { account: altId, mode: "all", champion: null, vs: null });
    expect(alt.detail).toMatchObject({ games: 1, timelines: { frames: 1 } });
    const solo = await getPlayerMatchups(handle.db, playerId, { account: null, mode: "solo", champion: "Gwen", vs: "Nasus" });
    expect(solo.detail!.games).toBe(3);
    // An unknown account id falls back to the Main account.
    expect((await getPlayerMatchups(handle.db, playerId, { account: "nope", mode: "all", champion: null, vs: null })).account).toBe(mainId);
  });

  it("covers the current season by default; an earlier season, or all of them, on request", async () => {
    const db = handle.db;
    await db.insert(accountMatches).values({ accountId: mainId, matchId: "OC1_OLD", gameCreation: Date.now() - 300 * DAY, queueId: 420, championId: "Gwen", role: "TOP", win: true, enemyChampionId: "Nasus", patch: "15.24", gameDuration: 1700 });
    try {
      const now = await getPlayerMatchups(db, playerId, { account: null, mode: "all", champion: "Gwen", vs: "Nasus" });
      expect(now.season).toBe(16);
      // A 2025 game stays stored but is never offered, nor counted under "all seasons".
      expect(now.seasons).toEqual([16]);
      expect(now.detail!.games).toBe(4);
      const last = await getPlayerMatchups(db, playerId, { account: null, season: 15, mode: "all", champion: "Gwen", vs: "Nasus" });
      expect(last.season).toBe(16);
      expect(last.detail!.matches.map((m) => m.matchId)).not.toContain("OC1_OLD");
      const every = await getPlayerMatchups(db, playerId, { account: null, season: "all", mode: "all", champion: "Gwen", vs: "Nasus" });
      expect(every.detail!.games).toBe(4);
      // A season without stored games falls back to the current one.
      expect((await getPlayerMatchups(db, playerId, { account: null, season: 9, mode: "all", champion: null, vs: null })).season).toBe(16);
      expect(parseMatchupFilter({ season: "15" }).season).toBe(15);
      expect(parseMatchupFilter({ season: "all" }).season).toBe("all");
      expect(parseMatchupFilter({}).season).toBeNull();
    } finally {
      await db.delete(accountMatches).where(eq(accountMatches.matchId, "OC1_OLD"));
    }
  });

  it("for the champion window: the exact champion, its lane against every opponent, its latest games, and the role it was opened in", async () => {
    const db = handle.db;
    const w = await getPlayerMatchups(db, playerId, { account: "all", mode: "all", champion: "Gwen", vs: "Darius", role: "TOP", exact: true });
    expect(w).toMatchObject({ champion: "Gwen", vs: "Darius", role: "TOP" });
    // Every lane game on Gwen, both accounts: 5 on Main + 1 on the alt; one without a clear opponent.
    expect(w.lane).toMatchObject({ games: 6, wins: 3, timelines: { frames: 3, pending: 2, unavailable: 0, noDetails: 1 } });
    expect(w.lane!.recent.map((g) => g.matchId)).toEqual(["OC1_1", "OC1_2", "OC1_3", "OC1_4", "OC1_5"]);
    expect(w.lane!.recent.map((g) => g.opponentId)).toEqual(["Nasus", "Nasus", "Nasus", "Nasus", "Darius"]);
    // 10:00 over every opponent: game 1 (+400), game 2 (−300), the alt's game 4 (±0).
    expect(w.lane!.checkpoints.find((c) => c.minute === 10)).toMatchObject({ games: 3, aheadInGold: 1 });
    // The chosen opponent's detail is read from the same games.
    expect(w.detail).toMatchObject({ games: 1, wins: 0, timelines: { frames: 0, pending: 1 } });
    // Without `exact` there is no champion-wide lane (the old Matchups list never needed it).
    expect((await getPlayerMatchups(db, playerId, { account: "all", mode: "all", champion: "Gwen", vs: null })).lane).toBeNull();
    // Another role: nothing on Gwen there, said as such rather than falling back to another champion.
    const mid = await getPlayerMatchups(db, playerId, { account: "all", mode: "all", champion: "Gwen", vs: null, role: "MID", exact: true });
    expect(mid).toMatchObject({ champion: "Gwen", opponents: [], detail: null, lane: null, games: 0 });
    // A champion never played keeps its name in the window, with no data invented.
    const none = await getPlayerMatchups(db, playerId, { account: "all", mode: "all", champion: "Ahri", vs: null, exact: true });
    expect(none).toMatchObject({ champion: "Ahri", opponents: [], detail: null, lane: null });
    expect(JSON.stringify(w)).not.toMatch(/opp-|me-main|me-alt|enemy-mid|ally/);
    expect(parseMatchupFilter({ role: "TOP" }).role).toBe("TOP");
    expect(parseMatchupFilter({ role: "nonsense" }).role).toBeNull();
  });
});

describe("timeline backfill", () => {
  it("fetches missing timelines newest first, keeps build rows, records unavailable ones and stops at a refusal", async () => {
    const db = handle.db;
    // A build-order row stored before frames were kept: the backfill adds the frames, keeps the purchases.
    await db.insert(matchTimelines).values({ matchId: "OC1_5", platform: "oc1", participants: [{ puuid: "me-main", purchases: [[2000, 3078]], skills: [3] }] });
    const before = await timelineCoverage(db);
    expect(before).toMatchObject({ laneGames: 6, withFrames: 3, unavailable: 0, pending: 3 });
    const calls: string[] = [];
    const timeline = (id: string) => ({
      metadata: { matchId: id, participants: ["me-main", "opp"] },
      info: {
        participants: [
          { participantId: 1, puuid: "me-main" },
          { participantId: 2, puuid: "opp" },
        ],
        frames: [0, 60_100, 120_300].map((timestamp, i) => ({ timestamp, participantFrames: { "1": { totalGold: 500 + i * 400, xp: i * 300, minionsKilled: i * 7, jungleMinionsKilled: 0 }, "2": { totalGold: 500 + i * 380, xp: i * 290, minionsKilled: i * 6, jungleMinionsKilled: 0 } }, events: [] })),
      },
    });
    const respond = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
    let refuse = false;
    const fetchImpl = async (input: string | URL | Request) => {
      const url = String(input);
      calls.push(url);
      if (refuse) return respond(429, { status: { message: "rate limited" } });
      if (url.includes("OC1_6")) return respond(404, { status: { message: "not found" } });
      return respond(200, timeline(url.match(/OC1_\d/)![0]));
    };
    const client = new RiotApiClient({ apiKey: "k", fetchImpl, limiter: new RateLimiter([{ requests: 1000, seconds: 1 }]), sleep: async () => {}, maxRetries: 0 });
    const first = await backfillTimelines(db, client, { limit: 2, deadline: Date.now() + 60_000 });
    expect(first).toEqual({ fetched: 2, unavailable: 0, skipped: [], stoppedBy: null });
    // Newest first: game 3 (3 days old), then game 5.
    expect(calls.map((u) => u.match(/OC1_\d/)![0])).toEqual(["OC1_3", "OC1_5"]);
    const [kept] = await db.select().from(matchTimelines).where(eq(matchTimelines.matchId, "OC1_5"));
    // The stored purchases and skills stay; the answer only adds what the row lacked (kill times, frames).
    expect(kept!.participants).toEqual([{ puuid: "me-main", purchases: [[2000, 3078]], skills: [3], kills: [], deaths: [], assists: [] }]);
    expect(kept!.frames!.t).toEqual([0, 60_100, 120_300]);
    const second = await backfillTimelines(db, client, { limit: 5, deadline: Date.now() + 60_000 });
    expect(second).toEqual({ fetched: 0, unavailable: 1, skipped: [], stoppedBy: null });
    expect(await timelineCoverage(db)).toMatchObject({ laneGames: 6, withFrames: 5, unavailable: 1, pending: 0 });
    // Nothing left: no request at all. A refusal stops the run without writing anything.
    calls.length = 0;
    expect(await backfillTimelines(db, client, { limit: 5, deadline: Date.now() + 60_000 })).toEqual({ fetched: 0, unavailable: 0, skipped: [], stoppedBy: null });
    expect(calls).toHaveLength(0);
    await db.update(matchTimelines).set({ frames: null }).where(eq(matchTimelines.matchId, "OC1_3"));
    refuse = true;
    const refused = await backfillTimelines(db, client, { limit: 5, deadline: Date.now() + 60_000 });
    expect(refused.fetched).toBe(0);
    expect(refused.stoppedBy).toMatch(/429/);
    const [still] = await db.select().from(matchTimelines).where(eq(matchTimelines.matchId, "OC1_3"));
    expect(still!.frames).toBeNull();
  });
});

describe("data audit: queue classification", () => {
  it("counts stored games per Riot queue, Solo/Duo and Flex apart, and finds no reclassified game", async () => {
    const result = await runJob(handle.db, "data-audit", "cli");
    expect(result.ok).toBe(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- a loose JSON report
    const q = (result.summary as Record<string, any>).queueClassification;
    expect(q.ledgerByQueue).toEqual([
      { queueId: 420, accountRows: 7, games: 7 },
      { queueId: 440, accountRows: 1, games: 1 },
    ]);
    expect(q.accountVsDetailsQueueMismatch).toEqual({ games: 0, soloFlexSwapped: 0 });
    // The drafted-match archive belonged to the removed Draft feature; the audit no longer reads it.
    expect(q).not.toHaveProperty("draftedByMode");
  });
});
