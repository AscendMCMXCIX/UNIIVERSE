import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";
import { eq } from "drizzle-orm";
import { accountMatches, matchDetails, matchTimelines, type MatchParticipantDetail } from "@/server/db/schema";
import { FixtureStaticProvider } from "@/server/riot/static/fixture";
import { syncStaticData } from "@/server/riot/static/sync";
import { createPlayer, getOrCreateTeam } from "@/server/repositories/team";
import { addAccount } from "@/server/accounts/repository";
import { buildSteps, getMatchTimeline, maxOrderOf, timelineFrames, timelineParticipants, timelineRow } from "@/server/accounts/match-timeline";
import { RiotApiClient } from "@/server/riot/api/client";
import { RateLimiter } from "@/server/riot/api/rate-limiter";
import type { RiotMatchTimeline } from "@/server/riot/api/schemas";

/*
  A match minute by minute from Riot's match timeline: build and skill order, the lane at fixed
  minutes and the teams' gold difference. Read correctly, fetched once on demand, never guessed.
*/

const ev = (type: string, timestamp: number, participantId: number, extra: Record<string, unknown> = {}) => ({ type, timestamp, participantId, ...extra });

function timeline(matchId: string, puuids: string[]): RiotMatchTimeline {
  return {
    metadata: { matchId, participants: puuids },
    info: {
      participants: puuids.map((puuid, i) => ({ participantId: i + 1, puuid })),
      frames: [
        {
          events: [
            ev("ITEM_PURCHASED", 2_000, 1, { itemId: 1055 }),
            ev("ITEM_PURCHASED", 2_500, 1, { itemId: 2003 }),
            ev("ITEM_PURCHASED", 2_600, 1, { itemId: 2003 }),
            ev("SKILL_LEVEL_UP", 70_000, 1, { skillSlot: 1, levelUpType: "NORMAL" }),
            ev("ITEM_PURCHASED", 3_000, 2, { itemId: 1056 }),
          ],
        },
        {
          events: [
            ev("ITEM_PURCHASED", 400_000, 1, { itemId: 1037 }),
            ev("ITEM_UNDO", 401_000, 1, { beforeId: 1037, afterId: 0 }),
            ev("ITEM_PURCHASED", 402_000, 1, { itemId: 1036 }),
            ev("ITEM_DESTROYED", 410_000, 1, { itemId: 2003 }),
            ev("SKILL_LEVEL_UP", 130_000, 1, { skillSlot: 3, levelUpType: "NORMAL" }),
            ev("SKILL_LEVEL_UP", 200_000, 1, { skillSlot: 2, levelUpType: "NORMAL" }),
            ev("SKILL_LEVEL_UP", 300_000, 1, { skillSlot: 1, levelUpType: "EVOLVE" }),
          ],
        },
      ],
    },
  };
}

describe("reading a timeline", () => {
  it("keeps purchases in order, removes undone ones, and records skill level-ups (not evolutions)", () => {
    const [me, other] = timelineParticipants(timeline("OC1_T", ["p1", "p2"]));
    expect(me).toEqual({ puuid: "p1", purchases: [[2_000, 1055], [2_500, 2003], [2_600, 2003], [402_000, 1036]], skills: [1, 3, 2] });
    expect(other).toEqual({ puuid: "p2", purchases: [[3_000, 1056]], skills: [] });
  });

  it("falls back to the metadata order when the timeline lists no participants", () => {
    const t = timeline("OC1_T", ["p1", "p2"]);
    t.info.participants = [];
    expect(timelineParticipants(t).map((p) => p.puuid)).toEqual(["p1", "p2"]);
  });

  it("keeps each player's gold, experience and CS at every frame, with the frames' own timestamps", () => {
    const t = timeline("OC1_T", ["p1", "p2", "p3"]);
    const pf = (gold: number, xp: number, minions: number, jungle = 0) => ({ totalGold: gold, xp, minionsKilled: minions, jungleMinionsKilled: jungle });
    t.info.frames = [
      { timestamp: 0, participantFrames: { "1": pf(500, 0, 0), "2": pf(500, 0, 0), "3": pf(500, 0, 0) }, events: [] },
      { timestamp: 60_412, participantFrames: { "1": pf(700, 300, 2, 1), "2": pf(650, 280, 3), "3": pf(600, 250, 0) }, events: [] },
      // Player 3 has no figures in this frame: left out entirely rather than filled in.
      { timestamp: 120_903, participantFrames: { "1": pf(1100, 700, 9, 1), "2": pf(980, 640, 10) }, events: [] },
      // A frame without figures (events only) is not a frame of figures.
      { timestamp: 150_000, events: [] },
    ];
    const frames = timelineFrames(t);
    expect(frames.t).toEqual([0, 60_412, 120_903]);
    expect(frames.p.p1).toEqual({ g: [500, 700, 1100], x: [0, 300, 700], c: [0, 3, 10] });
    expect(frames.p.p2).toEqual({ g: [500, 650, 980], x: [0, 280, 640], c: [0, 3, 10] });
    expect(frames.p.p3).toBeUndefined();
    // Timelines without frame figures store none (nothing invented).
    expect(timelineFrames(timeline("OC1_T", ["p1"]))).toEqual({ t: [], p: {} });
  });

  it("groups purchases by minute with counts, and finds the max order", () => {
    const steps = buildSteps(
      [
        [2_000, 1055],
        [2_500, 2003],
        [2_600, 2003],
        [402_000, 1036],
      ],
      (id) => ({ name: `Item ${id}`, url: null }),
    );
    expect(steps).toEqual([
      { minute: 0, items: [{ id: 1055, count: 1, name: "Item 1055", url: null }, { id: 2003, count: 2, name: "Item 2003", url: null }] },
      { minute: 6, items: [{ id: 1036, count: 1, name: "Item 1036", url: null }] },
    ]);
    // Q maxed first, then E, then W.
    expect(maxOrderOf([1, 3, 2, 1, 1, 4, 1, 3, 1, 3, 4, 3, 3, 2, 2, 4, 2, 2])).toEqual(["Q", "E", "W"]);
    // Early game: by points so far.
    expect(maxOrderOf([1, 3, 2, 3])).toEqual(["E", "Q", "W"]);
  });
});

describe("loading the build of a stored game", () => {
  let handle: DbHandle;
  let owner: string;
  let stranger: string;
  beforeAll(async () => {
    handle = await testDb();
    const db = handle.db;
    await syncStaticData(db, new FixtureStaticProvider(), { fingerprint: false });
    const team = await getOrCreateTeam(db);
    owner = (await createPlayer(db, team.id, { displayName: "Builder", primaryRole: "MID", primaryPool: ["Ahri"] })).id;
    stranger = (await createPlayer(db, team.id, { displayName: "Stranger", primaryRole: "TOP", primaryPool: ["Gwen"] })).id;
    const account = await addAccount(db, { ownerType: "player", playerId: owner, riotId: "Builder#OCE", platform: "oc1", puuid: "p1" });
    await addAccount(db, { ownerType: "player", playerId: stranger, riotId: "Stranger#OCE", platform: "oc1", puuid: "p9" });
    const base = { accountId: account.id, gameCreation: Date.now() - 86_400_000, queueId: 420, championId: "Ahri", role: "MID", win: true, patch: "16.20", gameDuration: 1800 };
    await db.insert(accountMatches).values([
      { ...base, matchId: "OC1_T" },
      { ...base, matchId: "OC1_GONE" },
      { ...base, matchId: "OC1_NEW" },
      { ...base, matchId: "OC1_BUSY" },
    ]);
    await db.insert(matchTimelines).values({ matchId: "OC1_T", platform: "oc1", participants: timelineParticipants(timeline("OC1_T", ["p1", "p2"])) });
  }, 60_000);
  afterAll(async () => {
    await handle.close();
  });

  it("shows a stored build without asking Riot", async () => {
    const r = await getMatchTimeline(handle.db, owner, "OC1_T", { fetch: true, client: null });
    expect(r.status).toBe("ok");
    if (r.status !== "ok") return;
    const build = r.timeline.build!;
    expect(build.steps.map((s) => s.minute)).toEqual([0, 6]);
    expect(build.steps[0]!.items.find((i) => i.id === 2003)?.count).toBe(2);
    expect(build.skills).toEqual(["Q", "E", "W"]);
    // Without the game's record or frames there is no lane or gold curve to read, and none is made up.
    expect(r.timeline.lane).toBeNull();
    expect(r.timeline.gold).toBeNull();
  });

  it("only for the player's own stored games", async () => {
    expect((await getMatchTimeline(handle.db, stranger, "OC1_T")).status).toBe("not-found");
    expect((await getMatchTimeline(handle.db, owner, "OC1_OTHER")).status).toBe("not-found");
  });

  it("says plainly when Riot access is not configured, and never guesses from the final items", async () => {
    expect(await getMatchTimeline(handle.db, owner, "OC1_NEW", { fetch: true, client: null })).toMatchObject({ status: "not-configured" });
    expect(await getMatchTimeline(handle.db, owner, "OC1_NEW")).toMatchObject({ status: "unavailable" });
  });

  it("fetches a missing timeline once, keeps it, and remembers games Riot no longer serves", async () => {
    const calls: string[] = [];
    const fetchImpl = async (input: string | URL | Request) => {
      const url = String(input);
      calls.push(url);
      if (url.endsWith("/OC1_NEW/timeline")) return new Response(JSON.stringify(timeline("OC1_NEW", ["p1", "p2"])), { status: 200, headers: { "content-type": "application/json" } });
      return new Response(JSON.stringify({ status: { message: "not found" } }), { status: 404, headers: { "content-type": "application/json" } });
    };
    const client = new RiotApiClient({ apiKey: "k", fetchImpl, limiter: new RateLimiter([{ requests: 1000, seconds: 1 }]), sleep: async () => {} });
    expect((await getMatchTimeline(handle.db, owner, "OC1_NEW", { fetch: true, client })).status).toBe("ok");
    expect((await getMatchTimeline(handle.db, owner, "OC1_NEW", { fetch: true, client })).status).toBe("ok");
    expect(calls.filter((u) => u.includes("OC1_NEW"))).toHaveLength(1);
    expect(calls[0]).toContain("sea.api.riotgames.com/lol/match/v5/matches/OC1_NEW/timeline");
    expect((await getMatchTimeline(handle.db, owner, "OC1_GONE", { fetch: true, client })).status).toBe("unavailable");
    expect((await getMatchTimeline(handle.db, owner, "OC1_GONE", { fetch: true, client })).status).toBe("unavailable");
    expect(calls.filter((u) => u.includes("OC1_GONE"))).toHaveLength(1);
  });

  it("says when Riot is limiting requests, and keeps nothing so the next open asks again", async () => {
    const fetchImpl = async () => new Response(JSON.stringify({ status: { message: "rate limited" } }), { status: 429, headers: { "content-type": "application/json", "retry-after": "1" } });
    const client = new RiotApiClient({ apiKey: "k", fetchImpl, limiter: new RateLimiter([{ requests: 1000, seconds: 1 }]), sleep: async () => {}, maxRetries: 0 });
    const r = await getMatchTimeline(handle.db, owner, "OC1_BUSY", { fetch: true, client });
    expect(r).toMatchObject({ status: "error" });
    expect(r.status !== "ok" && r.message).toContain("limiting requests");
    expect(await handle.db.select().from(matchTimelines).where(eq(matchTimelines.matchId, "OC1_BUSY"))).toHaveLength(0);
  });
});

/** A timeline with every player's figures at each minute: gold from `goldAt(slot, minute)`, XP and CS following it. */
function framedTimeline(matchId: string, puuids: string[], minutes: number, goldAt: (slot: number, minute: number) => number, missing: (slot: number) => boolean = () => false): RiotMatchTimeline {
  const t = timeline(matchId, puuids);
  t.info.participants = puuids.map((puuid, i) => ({ participantId: i + 1, puuid }));
  t.info.frames = Array.from({ length: minutes + 1 }, (_, m) => ({
    timestamp: m * 60_000,
    participantFrames: Object.fromEntries(puuids.flatMap((_, i) => (missing(i) ? [] : [[String(i + 1), { totalGold: goldAt(i, m), xp: goldAt(i, m) - 500, minionsKilled: m * 7, jungleMinionsKilled: 0 }]]))),
    events: [],
  }));
  return t;
}

describe("the lane and the gold difference of a stored game", () => {
  let handle: DbHandle;
  let owner: string;
  const LANES = ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"];
  const part = (puuid: string, teamId: number, position: string | null, over: Partial<MatchParticipantDetail> = {}): MatchParticipantDetail => ({ puuid, name: `${puuid}#OCE`, teamId, championId: "Ahri", championKey: 103, champLevel: 16, position, win: teamId === 100, kills: 2, deaths: 2, assists: 2, cs: 200, gold: 10_000, damage: 20_000, damageTaken: 10_000, vision: 20, wardsPlaced: 5, items: null, spells: null, runes: null, ...over });
  /** Ten players: the owner ("me") in the middle on blue, everyone else by lane. */
  const players = (matchId: string) => [...LANES.map((l) => part(l === "MIDDLE" ? "me" : `${matchId}-b-${l}`, 100, l)), ...LANES.map((l) => part(`${matchId}-r-${l}`, 200, l))];
  // Blue's middle earns 400 a minute, red's 350, everyone else 300: blue leads by 50 a minute.
  const goldAt = (slot: number, minute: number) => 500 + minute * (slot === 2 ? 400 : slot === 7 ? 350 : 300);

  async function store(matchId: string, participants: MatchParticipantDetail[], t: RiotMatchTimeline, accountId: string) {
    await handle.db.insert(accountMatches).values({ accountId, matchId, gameCreation: Date.now() - 86_400_000, queueId: 420, championId: "Ahri", role: "MID", win: true, patch: "16.20", gameDuration: 960 });
    await handle.db.insert(matchDetails).values({ matchId, platform: "oc1", queueId: 420, gameCreation: Date.now() - 86_400_000, gameDuration: 960, gameVersion: "16.20.1", teams: [], participants });
    await handle.db.insert(matchTimelines).values(timelineRow(matchId, "oc1", t));
  }

  beforeAll(async () => {
    handle = await testDb();
    const db = handle.db;
    await syncStaticData(db, new FixtureStaticProvider(), { fingerprint: false });
    const team = await getOrCreateTeam(db);
    owner = (await createPlayer(db, team.id, { displayName: "Laner", primaryRole: "MID", primaryPool: ["Ahri"] })).id;
    const account = await addAccount(db, { ownerType: "player", playerId: owner, riotId: "Laner#OCE", platform: "oc1", puuid: "me" });
    const lane = players("OC1_LANE");
    await store("OC1_LANE", lane, framedTimeline("OC1_LANE", lane.map((p) => p.puuid), 16, goldAt), account.id);
    // Two enemies recorded in the middle: no lane opponent is guessed.
    const shared = players("OC1_SHARED").map((p) => (p.puuid === "OC1_SHARED-r-TOP" ? { ...p, position: "MIDDLE" } : p));
    await store("OC1_SHARED", shared, framedTimeline("OC1_SHARED", shared.map((p) => p.puuid), 16, goldAt), account.id);
    // A removed player (erased) keeps their place but no figures: the gold curve is not drawn.
    const removed = players("OC1_REMOVED").map((p) => (p.puuid === "OC1_REMOVED-r-TOP" ? { ...p, puuid: "", name: null, position: null, removed: true as const } : p));
    await store("OC1_REMOVED", removed, framedTimeline("OC1_REMOVED", players("OC1_REMOVED").map((p) => p.puuid), 16, goldAt, (slot) => slot === 5), account.id);
    // A game over before 15:00.
    const short = players("OC1_SHORT");
    await store("OC1_SHORT", short, framedTimeline("OC1_SHORT", short.map((p) => p.puuid), 12, goldAt), account.id);
  }, 60_000);
  afterAll(async () => {
    await handle.close();
  });

  it("reads the player and the one enemy in the same position at 10:00 and 15:00", async () => {
    const r = await getMatchTimeline(handle.db, owner, "OC1_LANE");
    expect(r.status).toBe("ok");
    if (r.status !== "ok") return;
    expect(r.timeline.lane?.opponentSlot).toBe(7);
    const [ten, fifteen] = r.timeline.lane!.moments;
    expect(ten).toMatchObject({ minute: 10, you: { gold: 4_500, cs: 70 }, opponent: { gold: 4_000, cs: 70 } });
    expect(fifteen).toMatchObject({ minute: 15, you: { gold: 6_500 }, opponent: { gold: 5_750 } });
  });

  it("draws the gold difference from the player's side at every frame, all ten players counted", async () => {
    const r = await getMatchTimeline(handle.db, owner, "OC1_LANE");
    if (r.status !== "ok") throw new Error(r.message);
    expect(r.timeline.gold).toHaveLength(17);
    expect(r.timeline.gold![0]).toEqual({ minute: 0, diff: 0 });
    expect(r.timeline.gold![16]).toEqual({ minute: 16, diff: 800 });
    expect(r.timeline.minutes).toBe(16);
  });

  it("names no lane opponent when two enemies share the position", async () => {
    const r = await getMatchTimeline(handle.db, owner, "OC1_SHARED");
    if (r.status !== "ok") throw new Error(r.message);
    expect(r.timeline.lane).toBeNull();
    expect(r.timeline.gold).toHaveLength(17);
  });

  it("draws no gold curve when a player's figures are missing, and never pairs a removed player", async () => {
    const r = await getMatchTimeline(handle.db, owner, "OC1_REMOVED");
    if (r.status !== "ok") throw new Error(r.message);
    expect(r.timeline.gold).toBeNull();
    expect(r.timeline.lane?.opponentSlot).toBe(7);
  });

  it("leaves a minute the game never reached empty", async () => {
    const r = await getMatchTimeline(handle.db, owner, "OC1_SHORT");
    if (r.status !== "ok") throw new Error(r.message);
    const [ten, fifteen] = r.timeline.lane!.moments;
    expect(ten!.you).not.toBeNull();
    expect(fifteen).toEqual({ minute: 15, you: null, opponent: null });
  });
});
