import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { makeSeason2026Current, testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";
import type { Db } from "@/server/db/types";
import { FixtureStaticProvider } from "@/server/riot/static/fixture";
import { syncStaticData } from "@/server/riot/static/sync";
import { createPlayer, getOrCreateTeam, listPlayers } from "@/server/repositories/team";
import { addAccount, listAccountsForPlayer } from "@/server/accounts/repository";
import { syncAccount } from "@/server/accounts/sync";
import { getMatchTimeline, loadScoreTimelines, recordedGoldDifferenceOf } from "@/server/accounts/match-timeline";
import { cardPerformance, getMatchDetail, getMatchHistory, scoreRecordOf, type CardPerformance } from "@/server/players/match-history";
import { RiotApiClient } from "@/server/riot/api/client";
import { RateLimiter } from "@/server/riot/api/rate-limiter";
import { riotGame, type RiotGameFixture } from "../fixtures/riot-game";
import { seedDemoAccounts, seedDemoRoster } from "@/server/demo/seed";
import { accountMatches, matchDetails, matchTimelines, type MatchFrames } from "@/server/db/schema";
import { removedParticipant, redactTimeline } from "@/server/privacy/redact";
import { gameScoresOf, scoreReadsTimeline } from "@/domain/performance-inputs";
import { processEgress } from "@/server/db/egress";

/*
  The performance score on a collapsed Match History card is the opened game's score for that
  player, never another calculation. For every card, the list's `performance` is compared with
  gameScoresOf(getMatchDetail's view, getMatchTimeline's view) for the card's player, the way the
  opened game computes it in the browser: realistic ranked games (tests/fixtures/riot-game, synced
  through the real account sync and timeline request) with a stored timeline, without one (pending
  while the opened game would fetch it), with one Riot no longer provides, one kept before the kills
  and objectives (dated), one that contradicts its record, one with a removed player, and an ARAM
  game; then every card of the demo's players.
*/

const players = [
  { puuid: "cs-blue-top", gameName: "Ridgeline", tagLine: "OCE", champion: "Gwen" },
  { puuid: "cs-blue-jgl", gameName: "Canopy", tagLine: "OCE", champion: "Nocturne" },
  { puuid: "cs-blue-mid", gameName: "Card Member", tagLine: "OCE", champion: "Ahri" },
  { puuid: "cs-blue-adc", gameName: "Longbow", tagLine: "OCE", champion: "Jinx" },
  { puuid: "cs-blue-sup", gameName: "Lantern", tagLine: "OCE", champion: "Thresh" },
  { puuid: "cs-red-top", gameName: "Anvil", tagLine: "OCE", champion: "Darius" },
  { puuid: "cs-red-jgl", gameName: "Thicket", tagLine: "OCE", champion: "Graves" },
  { puuid: "cs-red-mid", gameName: "Facing", tagLine: "OCE", champion: "Syndra" },
  { puuid: "cs-red-adc", gameName: "Arrowhead", tagLine: "OCE", champion: "Caitlyn" },
  { puuid: "cs-red-sup", gameName: "Bulwark", tagLine: "OCE", champion: "Leona" },
];
const ME = players[2]!.puuid;
const ID = {
  lane: "OC1_7400000001",
  noTimeline: "OC1_7400000002",
  gone: "OC1_7400000003",
  dated: "OC1_7400000004",
  datedEmpty: "OC1_7400000005",
  contradicts: "OC1_7400000006",
  removed: "OC1_7400000007",
  aram: "OC1_7400000008",
} as const;
const SYNCED = [ID.lane, ID.noTimeline, ID.gone, ID.dated, ID.datedEmpty, ID.contradicts, ID.removed];

let handle: DbHandle;
let playerId = "";
const games = new Map<string, RiotGameFixture>();

function fakeRiot(puuid: string) {
  return async (input: string | URL | Request): Promise<Response> => {
    const url = String(input);
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
    if (url.includes("/riot/account/v1/region/by-game/lol/by-puuid/")) return json({ puuid, game: "lol", region: "OC1" });
    if (url.includes("/riot/account/v1/accounts/by-riot-id/")) {
      const parts = url.split("/by-riot-id/")[1]!.split("/");
      return json({ puuid, gameName: decodeURIComponent(parts[0]!), tagLine: decodeURIComponent(parts[1]!) });
    }
    if (url.includes("/lol/league/v4/entries/by-puuid/")) return json([]);
    if (url.includes("/lol/champion-mastery/v4/")) return json([]);
    if (url.includes("/ids?")) return json(new URL(url).searchParams.get("queue") === "420" && Number(new URL(url).searchParams.get("start") ?? 0) === 0 ? SYNCED : []);
    for (const [id, g] of games) {
      if (url.endsWith(`/lol/match/v5/matches/${id}/timeline`)) return id === ID.gone ? json({ status: { status_code: 404 } }, 404) : json(g.timeline);
      if (url.endsWith(`/lol/match/v5/matches/${id}`)) return json(g.match);
    }
    return json({}, 404);
  };
}
const riot = () => new RiotApiClient({ apiKey: "k", fetchImpl: fakeRiot(ME), limiter: new RateLimiter([{ requests: 1000, seconds: 1 }]), sleep: async () => {} });

/** The opened game's score for its player, as post-game.tsx computes it: the record's view and the timeline's view (null on any failure). */
async function openedScore(db: Db, pid: string, matchId: string, client: RiotApiClient | null): Promise<CardPerformance & { lane?: boolean }> {
  const detail = await getMatchDetail(db, pid, matchId, { viewerIsOwner: true });
  if (detail.status !== "ok") return { state: "none" };
  const tl = await getMatchTimeline(db, pid, matchId, { fetch: true, client });
  const { scores } = gameScoresOf(detail.view, tl.status === "ok" ? tl.timeline : null);
  const mine = scores?.players.find((p) => p.slot === detail.view.player.slot);
  if (!scores || !mine) return { state: "none" };
  return { state: "ok", score: mine.score, rank: mine.rank, of: scores.scored, mvp: mine.mvp, ace: mine.ace, version: scores.version, lane: mine.used.includes("lane") };
}

async function card(db: Db, pid: string, matchId: string, riotConfigured: boolean): Promise<CardPerformance> {
  const page = await getMatchHistory(db, pid, { per: 25 }, () => [], undefined, {}, { riotConfigured });
  const row = page.rows.find((r) => r.matchId === matchId);
  if (!row) throw new Error(`card ${matchId} not listed`);
  return row.performance;
}

const withoutLane = ({ lane: _lane, ...p }: CardPerformance & { lane?: boolean }) => p;

beforeAll(async () => {
  handle = await testDb();
  const db = handle.db;
  await syncStaticData(db, new FixtureStaticProvider(), { fingerprint: false });
  await makeSeason2026Current(db);
  SYNCED.forEach((id, i) => games.set(id, riotGame({ matchId: id, players, winner: i % 2 ? 100 : 200, durationS: 1_500 + i * 97, created: Date.now() - (i + 2) * 3_600_000, seed: 101 + i * 17 })));
  const team = await getOrCreateTeam(db);
  playerId = (await createPlayer(db, team.id, { displayName: "Card Member", primaryRole: "MID", primaryPool: ["Ahri"] })).id;
  await addAccount(db, { ownerType: "player", playerId, riotId: `${players[2]!.gameName}#OCE`, platform: "oc1" });
  await syncAccount(db, riot(), (await listAccountsForPlayer(db, playerId))[0]!);

  // Timelines as the opened game (or the backfill) stores them, then each variant made in storage.
  for (const id of [ID.lane, ID.dated, ID.datedEmpty, ID.contradicts, ID.removed]) expect((await getMatchTimeline(db, playerId, id, { fetch: true, client: riot() })).status).toBe("ok");
  // Kept before the kills and objectives were (29 Oct 2026): opening it fetches it again once.
  await db.update(matchTimelines).set({ events: null }).where(eq(matchTimelines.matchId, ID.dated));
  // Kept before the frames were too: opening it fills them.
  await db.update(matchTimelines).set({ events: null, frames: null }).where(eq(matchTimelines.matchId, ID.datedEmpty));
  // Each blue player's frames swapped with the red player's in the same position: a different game from the record.
  const [garble] = await db.select({ frames: matchTimelines.frames }).from(matchTimelines).where(eq(matchTimelines.matchId, ID.contradicts));
  const f = garble!.frames as MatchFrames;
  const swapped: MatchFrames["p"] = {};
  for (let i = 0; i < 5; i++) {
    swapped[players[i]!.puuid] = f.p[players[i + 5]!.puuid]!;
    swapped[players[i + 5]!.puuid] = f.p[players[i]!.puuid]!;
  }
  await db.update(matchTimelines).set({ frames: { t: f.t, p: swapped } }).where(eq(matchTimelines.matchId, ID.contradicts));
  // A player erased (the red top laner): a "Removed player" in the record, and gone from the timeline.
  const [rec] = await db.select().from(matchDetails).where(eq(matchDetails.matchId, ID.removed));
  await db.update(matchDetails).set({ participants: rec!.participants.map((p) => (p.puuid === players[5]!.puuid ? removedParticipant(p) : p)) }).where(eq(matchDetails.matchId, ID.removed));
  const [tlRow] = await db.select().from(matchTimelines).where(eq(matchTimelines.matchId, ID.removed));
  const kept = redactTimeline(tlRow!, (puuid) => puuid !== players[5]!.puuid);
  await db.update(matchTimelines).set({ participants: kept.participants, frames: kept.frames }).where(eq(matchTimelines.matchId, ID.removed));
  // An ARAM game: the lane game's record and timeline under another id and queue (the score reads no lane there).
  const [laneRec] = await db.select().from(matchDetails).where(eq(matchDetails.matchId, ID.lane));
  await db.insert(matchDetails).values({ ...laneRec!, matchId: ID.aram, queueId: 450, storedAt: undefined });
  const [laneTl] = await db.select().from(matchTimelines).where(eq(matchTimelines.matchId, ID.lane));
  await db.insert(matchTimelines).values({ ...laneTl!, matchId: ID.aram, storedAt: undefined });
  const [ledger] = await db.select().from(accountMatches).where(eq(accountMatches.matchId, ID.lane));
  await db.insert(accountMatches).values({ ...ledger!, matchId: ID.aram, queueId: 450, gameCreation: ledger!.gameCreation - 60_000 });
}, 120_000);

afterAll(async () => {
  await handle.close();
});

describe("a card's performance score is the opened game's", () => {
  it("with a stored timeline: the same score, place, MVP and ACE, the lane included", async () => {
    const opened = await openedScore(handle.db, playerId, ID.lane, null);
    expect(opened).toMatchObject({ state: "ok", lane: true });
    expect(await card(handle.db, playerId, ID.lane, true)).toEqual(withoutLane(opened));
  });

  it("an ARAM game reads no timeline and is scored as the opened game scores it", async () => {
    // Match History lists the Summoner's Rift queues only (domain/season-stats), so an ARAM game reaches no card today: the card's rule is checked directly.
    const db = handle.db;
    const opened = await openedScore(db, playerId, ID.aram, null);
    expect(opened).toMatchObject({ state: "ok", lane: false });
    const [d] = await db.select().from(matchDetails).where(eq(matchDetails.matchId, ID.aram));
    const me = d!.participants.find((p) => p.puuid === ME)!;
    const record = scoreRecordOf(d!, me);
    expect(scoreReadsTimeline(record)).toBe(false);
    expect(cardPerformance({ d: d!, me, record }, undefined, new Set([ME]), true)).toEqual(withoutLane(opened));
  });

  it("a timeline Riot no longer provides is final: scored without the lane, as the opened game is", async () => {
    // Before anyone opened it, its timeline is not stored: pending, as opening it asks Riot.
    expect(await card(handle.db, playerId, ID.gone, true)).toEqual({ state: "pending" });
    const opened = await openedScore(handle.db, playerId, ID.gone, riot());
    expect(opened).toMatchObject({ state: "ok", lane: false });
    const [row] = await handle.db.select({ participants: matchTimelines.participants }).from(matchTimelines).where(eq(matchTimelines.matchId, ID.gone));
    expect(row!.participants).toEqual([]);
    expect(await card(handle.db, playerId, ID.gone, true)).toEqual(withoutLane(opened));
  });

  it("a timeline that contradicts its record is not read, by the card or by the opened game", async () => {
    const opened = await openedScore(handle.db, playerId, ID.contradicts, null);
    expect(opened).toMatchObject({ state: "ok", lane: false });
    expect(await card(handle.db, playerId, ID.contradicts, true)).toEqual(withoutLane(opened));
  });

  it("a game with a removed player: the others are scored alike, nine of them", async () => {
    const opened = await openedScore(handle.db, playerId, ID.removed, null);
    expect(opened).toMatchObject({ state: "ok", of: 9 });
    expect(await card(handle.db, playerId, ID.removed, true)).toEqual(withoutLane(opened));
  });

  it("a dated timeline with its frames is final; one without frames is pending until it is opened", async () => {
    // Opening the dated one fetches it again, but its kept frames stay (completedTimeline): the score does not change.
    const before = await card(handle.db, playerId, ID.dated, true);
    expect(before.state).toBe("ok");
    expect(withoutLane(await openedScore(handle.db, playerId, ID.dated, riot()))).toEqual(before);
    expect(await card(handle.db, playerId, ID.dated, true)).toEqual(before);
    // Without frames, opening it fills them, and the lane with them.
    expect(await card(handle.db, playerId, ID.datedEmpty, true)).toEqual({ state: "pending" });
    const opened = await openedScore(handle.db, playerId, ID.datedEmpty, riot());
    expect(opened).toMatchObject({ state: "ok", lane: true });
    expect(await card(handle.db, playerId, ID.datedEmpty, true)).toEqual(withoutLane(opened));
  });

  it("no stored timeline: pending where the opened game would fetch it, else the stored score", async () => {
    // Without Riot access the opened game fetches nothing and scores the record alone: so does the card.
    const offline = await openedScore(handle.db, playerId, ID.noTimeline, null);
    expect(offline).toMatchObject({ state: "ok", lane: false });
    expect(await card(handle.db, playerId, ID.noTimeline, false)).toEqual(withoutLane(offline));
    // With it, the opened game would fetch the timeline first and score the lane: the card waits.
    expect(await card(handle.db, playerId, ID.noTimeline, true)).toEqual({ state: "pending" });
    const opened = await openedScore(handle.db, playerId, ID.noTimeline, riot());
    expect(opened).toMatchObject({ state: "ok", lane: true });
    expect(await card(handle.db, playerId, ID.noTimeline, true)).toEqual(withoutLane(opened));
  });

  it("the card's player removed from the record: no score", async () => {
    const id = "OC1_7400000099";
    const [rec] = await handle.db.select().from(matchDetails).where(eq(matchDetails.matchId, ID.lane));
    await handle.db.insert(matchDetails).values({ ...rec!, matchId: id, storedAt: undefined, participants: rec!.participants.map((p) => (p.puuid === ME ? removedParticipant(p) : p)) });
    const [ledger] = await handle.db.select().from(accountMatches).where(eq(accountMatches.matchId, ID.lane));
    await handle.db.insert(accountMatches).values({ ...ledger!, matchId: id, gameCreation: ledger!.gameCreation - 120_000 });
    expect(await card(handle.db, playerId, id, true)).toEqual({ state: "none" });
    await handle.db.delete(accountMatches).where(eq(accountMatches.matchId, id));
    await handle.db.delete(matchDetails).where(eq(matchDetails.matchId, id));
  });

  it("reads the record's gold as the timeline check does, and trims the timelines in the database", async () => {
    const db = handle.db;
    const [rec] = await db.select().from(matchDetails).where(eq(matchDetails.matchId, ID.lane));
    const truth = games.get(ID.lane)!.truth;
    expect(recordedGoldDifferenceOf(rec!.participants, 100)).toBe(truth.gold[100] - truth.gold[200]);
    expect(recordedGoldDifferenceOf(rec!.participants, 200)).toBe(truth.gold[200] - truth.gold[100]);
    const [removed] = await db.select().from(matchDetails).where(eq(matchDetails.matchId, ID.removed));
    expect(recordedGoldDifferenceOf(removed!.participants, 100)).toBeNull();
    // The dated game's timeline was completed when it was opened above: kept before the kills and objectives again.
    await db.update(matchTimelines).set({ events: null }).where(eq(matchTimelines.matchId, ID.dated));
    const read = await loadScoreTimelines(db, [ID.lane, ID.gone, ID.dated, ID.aram]);
    expect(read.get(ID.lane)).toMatchObject({ available: true, dated: false });
    // By place in the record, no PUUID sent: each player's gold and experience as stored, and that the timeline keeps them.
    const [full] = await db.select({ frames: matchTimelines.frames }).from(matchTimelines).where(eq(matchTimelines.matchId, ID.lane));
    const stored = full!.frames as MatchFrames;
    expect(read.get(ID.lane)!.t).toEqual(stored.t);
    expect(read.get(ID.lane)!.seats).toEqual(rec!.participants.map((p) => ({ kept: true, frames: { g: stored.p[p.puuid]!.g, x: stored.p[p.puuid]!.x } })));
    // The removed player's place: not kept, no frames.
    const removedRead = (await loadScoreTimelines(db, [ID.removed])).get(ID.removed)!;
    expect(removedRead.seats.map((s) => s.kept)).toEqual(removed!.participants.map((p) => p.puuid !== ""));
    expect(removedRead.seats.filter((s) => s.frames).length).toBe(9);
    expect(read.get(ID.gone)).toMatchObject({ available: false });
    expect(read.get(ID.dated)).toMatchObject({ available: true, dated: true });
    expect((await loadScoreTimelines(db, ["OC1_7400000098"])).size).toBe(0);
    // On Postgres (TEST_DATABASE_URL) the app counts what the database sends: a game's trimmed timeline is a few KB.
    if (process.env.TEST_DATABASE_URL) {
      const at = processEgress().bytes;
      await loadScoreTimelines(db, [ID.lane]);
      const bytes = processEgress().bytes - at;
      expect(bytes).toBeGreaterThan(1_000);
      expect(bytes).toBeLessThan(8_000);
    }
  });
});

describe("every card of the demo's players (demo mode: Riot access not configured)", () => {
  let demo: DbHandle;
  beforeAll(async () => {
    demo = await testDb();
    await syncStaticData(demo.db, new FixtureStaticProvider(), { fingerprint: false });
    await seedDemoRoster(demo.db);
    await seedDemoAccounts(demo.db);
  }, 120_000);
  afterAll(async () => {
    await demo.close();
  });

  it("shows the opened game's score and place on every card of the first page", async () => {
    const team = await getOrCreateTeam(demo.db);
    const roster = await listPlayers(demo.db, team.id);
    const states = { ok: 0, none: 0, pending: 0, mvp: 0, ace: 0, lane: 0 };
    for (const p of roster) {
      const page = await getMatchHistory(demo.db, p.id, { per: 25 }, () => [], undefined, {}, { riotConfigured: false });
      for (const row of page.rows) {
        const opened = await openedScore(demo.db, p.id, row.matchId, null);
        expect(row.performance, row.matchId).toEqual(withoutLane(opened));
        states[row.performance.state] += 1;
        if (opened.lane) states.lane += 1;
        if (row.performance.state === "ok" && row.performance.mvp) states.mvp += 1;
        if (row.performance.state === "ok" && row.performance.ace) states.ace += 1;
      }
    }
    expect(states.ok).toBeGreaterThan(100);
    expect(states.pending).toBe(0);
    // Most of them read their stored timeline's lane.
    expect(states.lane).toBeGreaterThan(states.ok / 2);
    expect(states.mvp).toBeGreaterThan(0);
    expect(states.ace).toBeGreaterThan(0);
  }, 300_000);

  it("with Riot access configured, only the Summoner's Rift games without a stored timeline wait", async () => {
    const team = await getOrCreateTeam(demo.db);
    const [p] = await listPlayers(demo.db, team.id);
    const offline = await getMatchHistory(demo.db, p!.id, { per: 25 }, () => [], undefined, {}, { riotConfigured: false });
    const online = await getMatchHistory(demo.db, p!.id, { per: 25 }, () => [], undefined, {}, { riotConfigured: true });
    const stored = new Set((await demo.db.select({ id: matchTimelines.matchId }).from(matchTimelines)).map((r) => r.id));
    let waiting = 0;
    online.rows.forEach((row, i) => {
      if (row.performance.state === "pending") {
        waiting += 1;
        expect(stored.has(row.matchId)).toBe(false);
      } else expect(row.performance).toEqual(offline.rows[i]!.performance);
    });
    expect(waiting).toBeGreaterThan(0);
    expect(waiting).toBeLessThan(online.rows.length / 2);
  });
});
