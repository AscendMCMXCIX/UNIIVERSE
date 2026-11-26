import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { makeSeason2026Current, testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";
import type { Db } from "@/server/db/types";
import { FixtureStaticProvider } from "@/server/riot/static/fixture";
import { syncStaticData } from "@/server/riot/static/sync";
import { createPlayer, getOrCreateTeam } from "@/server/repositories/team";
import { addAccount, listAccountsForPlayer } from "@/server/accounts/repository";
import { syncAccount } from "@/server/accounts/sync";
import { seedDemoAccounts, seedDemoRoster } from "@/server/demo/seed";
import { loadPlayedTogether } from "@/server/matches/played-together";
import { invalidateTogetherScores, loadScoreSources, togetherScores, type TogetherScoreGame } from "@/server/matches/together-scores";
import { getMatchTimeline, loadScoreTimelines } from "@/server/accounts/match-timeline";
import { gameScores, getMatchDetail, scoreRecordOf, type CardPerformance } from "@/server/players/match-history";
import { finalScoresOf, scoreInputsOf, scoreReadsTimeline } from "@/domain/performance-inputs";
import { togetherEntry } from "@/domain/played-together";
import { matchDetails, matchTimelines, type MatchFrames } from "@/server/db/schema";
import { eq, inArray } from "drizzle-orm";
import { processEgress } from "@/server/db/egress";
import { RiotApiClient } from "@/server/riot/api/client";
import { RateLimiter } from "@/server/riot/api/rate-limiter";
import { removedParticipant } from "@/server/privacy/redact";
import { riotGame, type RiotGameFixture } from "../fixtures/riot-game";

/*
  Team → Matches' member scores (the owner's requirements of 25 Nov 2026: one look for places across
  the site) are the opened game's score and place for each member, never another calculation: each
  shown game is scored once through Match History's own functions, from a record trimmed in the
  database to the score's figures. On the demo roster every member of every listed game is compared
  with getMatchDetail + getMatchTimeline + finalScoresOf, the way the opened game computes it in the
  browser; the trimmed record reads exactly what the whole one does; and on Postgres the bytes the
  database sends for the default page, and for "Show more" with the earlier games kept, are
  measured (docs/HOSTING_USAGE.md). The demo's games have no timelines, so realistic ranked games
  (tests/fixtures/riot-game, synced through the real account sync and timeline request) cover the
  lane: three team members, two on one side and one on the other, in a game with its stored
  timeline (listed for both sides), one without (pending while the opened game would fetch it),
  one whose timeline contradicts its record (listed first for a side none of them is matched on),
  and one Riot no longer serves (stored without players).
*/

let demo: DbHandle;
let teamId: string;

beforeEach(() => invalidateTogetherScores());

beforeAll(async () => {
  demo = await testDb();
  await syncStaticData(demo.db, new FixtureStaticProvider(), { fingerprint: false });
  await seedDemoRoster(demo.db);
  await seedDemoAccounts(demo.db);
  teamId = (await getOrCreateTeam(demo.db)).id;
}, 120_000);
afterAll(async () => {
  await demo.close();
});

describe("Team Matches' member scores", () => {
  it("are each member's opened-game score and place, MVP only on a won game and ACE only on a lost one", async () => {
    const data = await loadPlayedTogether(demo.db, teamId);
    const shown = data.games.slice(0, 20);
    expect(shown.length).toBeGreaterThan(2);
    const scores = await togetherScores(demo.db, teamId, shown, { riotConfigured: false });
    let compared = 0;
    for (const g of shown) {
      const entry = scores[togetherEntry(g.matchId, g.teamId)]!;
      expect(Object.keys(entry).sort()).toEqual(g.members.map((m) => m.playerId).sort());
      const ranks: number[] = [];
      for (const m of g.members) {
        const detail = await getMatchDetail(demo.db, m.playerId, g.matchId, { viewerIsOwner: true });
        if (detail.status !== "ok") throw new Error("demo record missing");
        const tl = await getMatchTimeline(demo.db, m.playerId, g.matchId, { fetch: false });
        const opened = finalScoresOf(detail.view, tl.status === "ok" ? tl.timeline : null);
        const mine = opened?.players.find((p) => p.slot === detail.view.player.slot);
        const got = entry[m.playerId]!;
        if (!opened || !mine) {
          expect(got.state).toBe("none");
          continue;
        }
        expect(got, `${g.matchId} ${m.playerId}`).toEqual({ state: "ok", score: mine.score, rank: mine.rank, of: opened.scored, mvp: mine.mvp, ace: mine.ace, version: opened.version });
        if (got.state !== "ok") continue;
        ranks.push(got.rank);
        if (got.mvp) expect(g.win, "an MVP on a won game").toBe(true);
        if (got.ace) expect(g.win, "an ACE on a lost game").toBe(false);
        compared += 1;
      }
      expect(new Set(ranks).size, "each member's place once").toBe(ranks.length);
    }
    expect(compared).toBeGreaterThan(5);
  });

  it("score from a trimmed record that reads exactly what the whole record does", async () => {
    const data = await loadPlayedTogether(demo.db, teamId);
    const ids = data.games.slice(0, 5).map((g) => g.matchId);
    const sources = await loadScoreSources(demo.db, ids);
    const whole = await demo.db.select().from(matchDetails).where(inArray(matchDetails.matchId, ids));
    expect(sources.size).toBe(whole.length);
    for (const d of whole) {
      const t = sources.get(d.matchId)!;
      expect([t.queueId, t.gameDuration]).toEqual([d.queueId, d.gameDuration]);
      // The score's inputs, built by the scoreboard's own mapping, and its scores are the same from both.
      const [trimmed, full] = [scoreRecordOf(t, t.participants[0]!), scoreRecordOf(d, d.participants[0]!)];
      expect(scoreInputsOf(trimmed, null)).toEqual(scoreInputsOf(full, null));
      expect(trimmed.teams.map((x) => [x.teamId, x.win, x.kills])).toEqual(full.teams.map((x) => [x.teamId, x.win, x.kills]));
      expect(finalScoresOf(trimmed, null)).toEqual(finalScoresOf(full, null));
      // Nothing the score does not read: no names, items, spells, runes or challenges.
      for (const p of t.participants) expect([p.name, p.items, p.spells, p.runes, p.challenges]).toEqual([null, null, null, null, undefined]);
    }
  });

  it("give no score to a game without a stored record, and an empty answer for no games", async () => {
    expect(await togetherScores(demo.db, teamId, [], { riotConfigured: false })).toEqual({});
    const missing = await togetherScores(demo.db, teamId, [{ matchId: "OC1_NOT_STORED", teamId: 100, members: [{ playerId: "p1", championId: "Ahri" }] }], { riotConfigured: false });
    expect(missing).toEqual({ [togetherEntry("OC1_NOT_STORED", 100)]: { p1: { state: "none" } } });
  });

  it("give no score to a game Riot no longer serves (stored without players), on either side and on the Bookmarked view's side 0", async () => {
    const id = "OC1_NO_PLAYERS";
    await demo.db.insert(matchDetails).values({ matchId: id, platform: null, queueId: 420, gameCreation: Date.now() - 86_400_000, gameDuration: 1_800, gameVersion: null, teams: [], participants: [] });
    const listed = [0, 100, 200].map((side) => ({ matchId: id, teamId: side, members: [{ playerId: "p1", championId: "Ahri" }] }));
    const got = await togetherScores(demo.db, teamId, listed, { riotConfigured: false });
    expect(got).toEqual(Object.fromEntries([0, 100, 200].map((side) => [togetherEntry(id, side), { p1: { state: "none" } }])));
    await demo.db.delete(matchDetails).where(eq(matchDetails.matchId, id));
  });

  it("read a few KB a game from the database, and on Show more only the games not kept (Postgres only: the app counts what it sends)", async () => {
    if (!process.env.TEST_DATABASE_URL) return;
    const data = await loadPlayedTogether(demo.db, teamId);
    const shown = data.games.slice(0, 20);
    const measure = async (games: readonly TogetherScoreGame[]) => {
      const at = processEgress().bytes;
      await togetherScores(demo.db, teamId, games, { riotConfigured: false });
      return processEgress().bytes - at;
    };
    const bytes = await measure(shown);
    const perGame = bytes / shown.length;
    // Measured on the demo (docs/HOSTING_USAGE.md): the trimmed records, the members' PUUID lookup and any lane timelines.
    console.info(`together-scores egress: ${bytes} bytes for ${shown.length} games (${Math.round(perGame)} a game)`);
    expect(perGame).toBeLessThan(4_000);
    // The same page again, every game kept: only the members' PUUID lookup.
    const again = await measure(shown);
    console.info(`together-scores egress, the same ${shown.length} games kept: ${again} bytes`);
    expect(again).toBeLessThan(bytes / 4);
    // Show more: the earlier games kept, only the new ones read (the demo lists a few games: its first half, then all of them).
    invalidateTogetherScores();
    const half = Math.floor(shown.length / 2);
    const firstPage = await measure(shown.slice(0, half));
    const more = await measure(shown);
    console.info(`together-scores egress, Show more: ${firstPage} bytes for ${half} games, then ${more} bytes for ${shown.length} (${half} kept)`);
    expect(more).toBeLessThan(again + (shown.length - half) * perGame + 500);
    expect(more).toBeLessThan(bytes);
  });
});

/*
  Realistic ranked games with timelines: three team members (two on the blue side, one on the red),
  each with a linked account synced through the real account sync, and the games' timelines stored
  as the opened game stores them.
*/
const players = [
  { puuid: "ts-blue-top", gameName: "Ridgeline", tagLine: "OCE", champion: "Gwen" },
  { puuid: "ts-blue-jgl", gameName: "Canopy", tagLine: "OCE", champion: "Nocturne" },
  { puuid: "ts-blue-mid", gameName: "Together Mid", tagLine: "OCE", champion: "Ahri" },
  { puuid: "ts-blue-adc", gameName: "Together Adc", tagLine: "OCE", champion: "Jinx" },
  { puuid: "ts-blue-sup", gameName: "Lantern", tagLine: "OCE", champion: "Thresh" },
  { puuid: "ts-red-top", gameName: "Together Top", tagLine: "OCE", champion: "Darius" },
  { puuid: "ts-red-jgl", gameName: "Thicket", tagLine: "OCE", champion: "Graves" },
  { puuid: "ts-red-mid", gameName: "Facing", tagLine: "OCE", champion: "Syndra" },
  { puuid: "ts-red-adc", gameName: "Arrowhead", tagLine: "OCE", champion: "Caitlyn" },
  { puuid: "ts-red-sup", gameName: "Bulwark", tagLine: "OCE", champion: "Leona" },
];
const MEMBERS = [2, 3, 5];
const GAME = { lane: "OC1_7500000001", noTimeline: "OC1_7500000002", contradicts: "OC1_7500000003" } as const;
const SYNCED = [GAME.lane, GAME.noTimeline, GAME.contradicts];

function fakeRiot(puuid: string, games: ReadonlyMap<string, RiotGameFixture>) {
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
      if (url.endsWith(`/lol/match/v5/matches/${id}/timeline`)) return json(g.timeline);
      if (url.endsWith(`/lol/match/v5/matches/${id}`)) return json(g.match);
    }
    return json({}, 404);
  };
}

describe("Team Matches' member scores on games with timelines", () => {
  let handle: DbHandle;
  let team = "";
  const ids: string[] = [];
  const games = new Map<string, RiotGameFixture>();
  const riot = (puuid: string) => new RiotApiClient({ apiKey: "k", fetchImpl: fakeRiot(puuid, games), limiter: new RateLimiter([{ requests: 1000, seconds: 1 }]), sleep: async () => {} });

  /** The opened game's score for a member, as post-game.tsx computes it (with whether it read the lane). */
  async function opened(db: Db, playerId: string, matchId: string): Promise<CardPerformance & { lane?: boolean }> {
    const detail = await getMatchDetail(db, playerId, matchId, { viewerIsOwner: true });
    if (detail.status !== "ok") return { state: "none" };
    const tl = await getMatchTimeline(db, playerId, matchId, { fetch: false });
    const scores = finalScoresOf(detail.view, tl.status === "ok" ? tl.timeline : null);
    const mine = scores?.players.find((p) => p.slot === detail.view.player.slot);
    if (!scores || !mine) return { state: "none" };
    return { state: "ok", score: mine.score, rank: mine.rank, of: scores.scored, mvp: mine.mvp, ace: mine.ace, version: scores.version, lane: mine.used.includes("lane") };
  }
  const plain = ({ lane: _lane, ...p }: CardPerformance & { lane?: boolean }) => p;
  const member = (i: number) => ({ playerId: ids[MEMBERS.indexOf(i)]!, championId: players[i]!.champion });
  const blue = (matchId: string): TogetherScoreGame => ({ matchId, teamId: 100, members: [member(2), member(3)] });
  const red = (matchId: string): TogetherScoreGame => ({ matchId, teamId: 200, members: [member(5)] });

  beforeAll(async () => {
    handle = await testDb();
    const db = handle.db;
    await syncStaticData(db, new FixtureStaticProvider(), { fingerprint: false });
    await makeSeason2026Current(db);
    SYNCED.forEach((id, i) => games.set(id, riotGame({ matchId: id, players, winner: i % 2 ? 200 : 100, durationS: 1_620 + i * 131, created: Date.now() - (i + 2) * 3_600_000, seed: 307 + i * 29 })));
    team = (await getOrCreateTeam(db)).id;
    for (const i of MEMBERS) {
      const p = players[i]!;
      const id = (await createPlayer(db, team, { displayName: p.gameName, primaryRole: i === 5 ? "TOP" : i === 2 ? "MID" : "ADC", primaryPool: [p.champion] })).id;
      ids.push(id);
      await addAccount(db, { ownerType: "player", playerId: id, riotId: `${p.gameName}#OCE`, platform: "oc1" });
      await syncAccount(db, riot(p.puuid), (await listAccountsForPlayer(db, id))[0]!);
    }
    // Timelines as the opened game stores them (the game without one stays so).
    for (const id of [GAME.lane, GAME.contradicts]) expect((await getMatchTimeline(db, ids[0]!, id, { fetch: true, client: riot(players[2]!.puuid) })).status).toBe("ok");
    // Each blue player's frames swapped with the red player's in the same position: a different game from the record.
    const [garble] = await db.select({ frames: matchTimelines.frames }).from(matchTimelines).where(eq(matchTimelines.matchId, GAME.contradicts));
    const f = garble!.frames as MatchFrames;
    const swapped: MatchFrames["p"] = {};
    for (let i = 0; i < 5; i++) {
      swapped[players[i]!.puuid] = f.p[players[i + 5]!.puuid]!;
      swapped[players[i + 5]!.puuid] = f.p[players[i]!.puuid]!;
    }
    await db.update(matchTimelines).set({ frames: { t: f.t, p: swapped } }).where(eq(matchTimelines.matchId, GAME.contradicts));
  }, 180_000);
  afterAll(async () => {
    await handle.close();
  });

  it("score each member as the opened game does, the lane from the stored timeline included, a game listed for both sides scored once", async () => {
    const got = await togetherScores(handle.db, team, [blue(GAME.lane), red(GAME.lane)], { riotConfigured: true });
    for (const [side, i] of [[100, 2], [100, 3], [200, 5]] as const) {
      const want = await opened(handle.db, member(i).playerId, GAME.lane);
      expect(want, `member ${i}`).toMatchObject({ state: "ok", lane: true });
      expect(got[togetherEntry(GAME.lane, side)]![member(i).playerId], `member ${i}`).toEqual(plain(want));
    }
  });

  it("a timeline that contradicts its record is not read, whichever side is listed first, even one none of the members is matched on", async () => {
    // The red side listed first, for a member who is not in the game: the gold check is still made (from every player's side).
    const stranger: TogetherScoreGame = { matchId: GAME.contradicts, teamId: 200, members: [{ playerId: "not-in-the-game", championId: "Zed" }] };
    const got = await togetherScores(handle.db, team, [stranger, blue(GAME.contradicts)], { riotConfigured: true });
    expect(got[togetherEntry(GAME.contradicts, 200)]).toEqual({ "not-in-the-game": { state: "none" } });
    for (const i of [2, 3]) {
      const want = await opened(handle.db, member(i).playerId, GAME.contradicts);
      expect(want, `member ${i}`).toMatchObject({ state: "ok", lane: false });
      expect(got[togetherEntry(GAME.contradicts, 100)]![member(i).playerId], `member ${i}`).toEqual(plain(want));
    }
  });

  it("no stored timeline: pending where the opened game would fetch it (Riot configured), else the record's score; once stored, the lane, without dropping the kept scores", async () => {
    const offline = await togetherScores(handle.db, team, [blue(GAME.noTimeline)], { riotConfigured: false });
    for (const i of [2, 3]) {
      const want = await opened(handle.db, member(i).playerId, GAME.noTimeline);
      expect(want).toMatchObject({ state: "ok", lane: false });
      expect(offline[togetherEntry(GAME.noTimeline, 100)]![member(i).playerId]).toEqual(plain(want));
    }
    const waiting = await togetherScores(handle.db, team, [blue(GAME.noTimeline)], { riotConfigured: true });
    expect(waiting[togetherEntry(GAME.noTimeline, 100)]).toEqual({ [member(2).playerId]: { state: "pending" }, [member(3).playerId]: { state: "pending" } });
    // The opened game fetches and stores the timeline: the next render scores it with the lane (a pending game is never kept as pending).
    expect((await getMatchTimeline(handle.db, ids[0]!, GAME.noTimeline, { fetch: true, client: riot(players[2]!.puuid) })).status).toBe("ok");
    const scored = await togetherScores(handle.db, team, [blue(GAME.noTimeline)], { riotConfigured: true });
    for (const i of [2, 3]) {
      const want = await opened(handle.db, member(i).playerId, GAME.noTimeline);
      expect(want).toMatchObject({ state: "ok", lane: true });
      expect(scored[togetherEntry(GAME.noTimeline, 100)]![member(i).playerId]).toEqual(plain(want));
    }
    await handle.db.delete(matchTimelines).where(eq(matchTimelines.matchId, GAME.noTimeline));
  });

  it("keep a finished game's scores until they are dropped (an erasure drops them): Show more reads only the games not kept", async () => {
    const db = handle.db;
    const first = await togetherScores(db, team, [blue(GAME.lane)], { riotConfigured: true });
    const mid = member(2).playerId;
    expect(first[togetherEntry(GAME.lane, 100)]![mid]!.state).toBe("ok");
    // The record changes in storage (the mid laner erased): the kept score stands until the scores are dropped.
    const [rec] = await db.select().from(matchDetails).where(eq(matchDetails.matchId, GAME.lane));
    await db.update(matchDetails).set({ participants: rec!.participants.map((p) => (p.puuid === players[2]!.puuid ? removedParticipant(p) : p)) }).where(eq(matchDetails.matchId, GAME.lane));
    expect(await togetherScores(db, team, [blue(GAME.lane)], { riotConfigured: true })).toEqual(first);
    invalidateTogetherScores();
    const after = await togetherScores(db, team, [blue(GAME.lane)], { riotConfigured: true });
    expect(after[togetherEntry(GAME.lane, 100)]![mid]).toEqual({ state: "none" });
    expect(after[togetherEntry(GAME.lane, 100)]![member(3).playerId]).toMatchObject({ state: "ok", of: 9 });
    await db.update(matchDetails).set({ participants: rec!.participants }).where(eq(matchDetails.matchId, GAME.lane));
  });

  it("the trimmed record reads the timeline exactly as the whole one: the same scores, the lane included", async () => {
    const db = handle.db;
    const sources = await loadScoreSources(db, SYNCED);
    const stored = await loadScoreTimelines(db, SYNCED);
    for (const id of [GAME.lane, GAME.contradicts]) {
      const [full] = await db.select().from(matchDetails).where(eq(matchDetails.matchId, id));
      const trimmed = sources.get(id)!;
      const own = new Set([players[2]!.puuid]);
      const [a, b] = [gameScores(trimmed, scoreRecordOf(trimmed, trimmed.participants[0]!), stored.get(id), own, true), gameScores(full!, scoreRecordOf(full!, full!.participants[0]!), stored.get(id), own, true)];
      expect(scoreReadsTimeline(scoreRecordOf(trimmed, trimmed.participants[0]!))).toBe(true);
      expect(a).toEqual(b);
      if (a === "pending" || !a) throw new Error(`${id} not scored`);
      expect(a.players.some((p) => p.used.includes("lane")), id).toBe(id === GAME.lane);
    }
  });
});
