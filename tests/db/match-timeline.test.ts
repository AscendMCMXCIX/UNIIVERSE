import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";
import { eq } from "drizzle-orm";
import { accountMatches, matchDetails, matchTimelines, type MatchParticipantDetail } from "@/server/db/schema";
import { FixtureStaticProvider } from "@/server/riot/static/fixture";
import { syncStaticData } from "@/server/riot/static/sync";
import { createPlayer, getOrCreateTeam } from "@/server/repositories/team";
import { addAccount } from "@/server/accounts/repository";
import { buildSteps, completedTimeline, getMatchTimeline, maxOrderOf, timelineEvents, timelineFrames, timelineParticipants, timelineRow } from "@/server/accounts/match-timeline";
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
    expect(me).toEqual({ puuid: "p1", purchases: [[2_000, 1055], [2_500, 2003], [2_600, 2003], [402_000, 1036]], skills: [1, 3, 2], kills: [], deaths: [], assists: [] });
    expect(other).toEqual({ puuid: "p2", purchases: [[3_000, 1056]], skills: [], kills: [], deaths: [], assists: [] });
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

  it("records the champion kills each player took part in; an execution counts only as a death", () => {
    const t = timeline("OC1_T", ["p1", "p2", "p3", "p4", "p5", "p6", "p7", "p8", "p9", "p10"]);
    t.info.frames[0]!.events.push(
      { type: "CHAMPION_KILL", timestamp: 300_000, killerId: 1, victimId: 6, assistingParticipantIds: [2, 3, 2] },
      { type: "CHAMPION_KILL", timestamp: 420_000, killerId: 6, victimId: 1, assistingParticipantIds: [7] },
      { type: "CHAMPION_KILL", timestamp: 430_000, killerId: 0, victimId: 2 },
    );
    const by = new Map(timelineParticipants(t).map((p) => [p.puuid, p]));
    expect(by.get("p1")).toMatchObject({ kills: [300_000], deaths: [420_000], assists: [] });
    // An assist is counted once even if Riot lists the player twice.
    expect(by.get("p2")).toMatchObject({ kills: [], deaths: [430_000], assists: [300_000] });
    expect(by.get("p6")).toMatchObject({ kills: [420_000], deaths: [300_000] });
    expect(by.get("p7")).toMatchObject({ assists: [420_000] });
  });

  it("keeps the objectives each team took: monsters by the team that took them, buildings for the side that broke them", () => {
    const t = timeline("OC1_T", ["p1", "p2"]);
    const kill = (timestamp: number, extra: Record<string, unknown>) => ({ type: "ELITE_MONSTER_KILL", timestamp, ...extra });
    t.info.frames[1]!.events.push(
      kill(360_000, { killerId: 2, killerTeamId: 100, monsterType: "DRAGON", monsterSubType: "FIRE_DRAGON" }),
      // No team given: read from the killer's side (participants 6 to 10 are red).
      kill(400_000, { killerId: 7, monsterType: "HORDE" }),
      kill(900_000, { killerTeamId: 200, monsterType: "RIFTHERALD" }),
      kill(1_200_000, { killerTeamId: 100, monsterType: "ATAKHAN" }),
      kill(1_500_000, { killerTeamId: 200, monsterType: "BARON_NASHOR" }),
      kill(2_100_000, { killerTeamId: 100, monsterType: "DRAGON", monsterSubType: "ELDER_DRAGON" }),
      // A monster Riot names that this does not know, and one with no team at all: left out.
      kill(2_150_000, { killerTeamId: 100, monsterType: "SCUTTLE" }),
      kill(2_160_000, { killerId: 0, monsterType: "DRAGON", monsterSubType: "WATER_DRAGON" }),
      // Riot names the side that lost the building.
      { type: "BUILDING_KILL", timestamp: 700_000, killerId: 1, teamId: 200, buildingType: "TOWER_BUILDING", laneType: "TOP_LANE", towerType: "OUTER_TURRET" },
      { type: "BUILDING_KILL", timestamp: 1_900_000, killerId: 8, teamId: 100, buildingType: "INHIBITOR_BUILDING", laneType: "MID_LANE" },
      { type: "TURRET_PLATE_DESTROYED", timestamp: 500_000, killerId: 1, teamId: 200, laneType: "BOT_LANE" },
    );
    expect(timelineEvents(t).objectives).toEqual([
      { t: 360_000, team: 100, kind: "dragon", detail: "FIRE" },
      { t: 400_000, team: 200, kind: "grubs" },
      { t: 700_000, team: 100, kind: "tower", detail: "TOP OUTER" },
      { t: 900_000, team: 200, kind: "herald" },
      { t: 1_200_000, team: 100, kind: "atakhan" },
      { t: 1_500_000, team: 200, kind: "baron" },
      { t: 1_900_000, team: 200, kind: "inhibitor", detail: "MID" },
      { t: 2_100_000, team: 100, kind: "elder" },
    ]);
    // A timeline Riot no longer provides is kept as such, with no events to ask for again.
    expect(timelineRow("OC1_GONE", "oc1", null).events).toEqual({ objectives: [], missing: true });
  });

  it("completes a kept timeline without replacing what it holds", () => {
    const stored = { participants: [{ puuid: "a", purchases: [[1000, 1055]] as Array<[number, number]>, skills: [1] }], frames: { t: [0, 60_000], p: { a: { g: [500, 900], x: [0, 100], c: [0, 5] } } }, events: null };
    const fresh = {
      matchId: "M",
      platform: "oc1",
      participants: [
        { puuid: "a", purchases: [] as Array<[number, number]>, skills: [], kills: [61_000], deaths: [], assists: [] },
        { puuid: "b", purchases: [[2000, 3078]] as Array<[number, number]>, skills: [2], kills: [], deaths: [61_000], assists: [] },
      ],
      frames: { t: [], p: {} },
      events: { objectives: [{ t: 300_000, team: 100 as const, kind: "dragon" as const }] },
    };
    // The stored purchases, skills and frames stay; the answer adds the kill times, the player the row lacked and the objectives.
    expect(completedTimeline(stored, fresh)).toEqual({
      participants: [{ puuid: "a", purchases: [[1000, 1055]], skills: [1], kills: [61_000], deaths: [], assists: [] }, fresh.participants[1]],
      frames: stored.frames,
      events: fresh.events,
    });
    // Nothing kept before: the answer as it is. Riot no longer providing it: everything kept stays.
    expect(completedTimeline(undefined, fresh)).toEqual({ participants: fresh.participants, frames: fresh.frames, events: fresh.events });
    const gone = completedTimeline(stored, timelineRow("M", "oc1", null));
    expect(gone).toEqual({ participants: stored.participants, frames: stored.frames, events: { objectives: [], missing: true } });
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

describe("the kills and objectives of a stored game", () => {
  let handle: DbHandle;
  let owner: string;
  let accountId: string;
  const LANES = ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"];
  const part = (puuid: string, teamId: number, position: string | null, over: Partial<MatchParticipantDetail> = {}): MatchParticipantDetail => ({ puuid, name: `${puuid}#OCE`, teamId, championId: "Ahri", championKey: 103, champLevel: 16, position, win: teamId === 100, kills: 2, deaths: 2, assists: 2, cs: 200, gold: 10_000, damage: 20_000, damageTaken: 10_000, vision: 20, wardsPlaced: 5, items: null, spells: null, runes: null, ...over });
  /** Ten players: the owner ("me", participant 3) in the middle on blue. */
  const players = (matchId: string) => [...LANES.map((l) => part(l === "MIDDLE" ? "me" : `${matchId}-b-${l}`, 100, l)), ...LANES.map((l) => part(`${matchId}-r-${l}`, 200, l))];
  /** A game of 20 minutes: the player kills participant 8 at 5:00 (participants 1 and 2 assisting) and is killed by them at 7:00; participant 4 is executed; blue takes a dragon and a tower, red voidgrubs and Baron. */
  function eventful(matchId: string): RiotMatchTimeline {
    const t = framedTimeline(matchId, players(matchId).map((p) => p.puuid), 20, (slot, minute) => 500 + minute * 300);
    t.info.frames[1]!.events.push(
      { type: "CHAMPION_KILL", timestamp: 300_000, killerId: 3, victimId: 8, assistingParticipantIds: [1, 2] },
      { type: "CHAMPION_KILL", timestamp: 420_000, killerId: 8, victimId: 3, assistingParticipantIds: [9] },
      { type: "CHAMPION_KILL", timestamp: 430_000, killerId: 0, victimId: 4 },
      { type: "ELITE_MONSTER_KILL", timestamp: 360_000, killerId: 2, killerTeamId: 100, monsterType: "DRAGON", monsterSubType: "FIRE_DRAGON" },
      { type: "ELITE_MONSTER_KILL", timestamp: 600_000, killerId: 7, monsterType: "HORDE" },
      { type: "BUILDING_KILL", timestamp: 700_000, killerId: 1, teamId: 200, buildingType: "TOWER_BUILDING", laneType: "TOP_LANE", towerType: "OUTER_TURRET" },
      { type: "ELITE_MONSTER_KILL", timestamp: 1_000_000, killerTeamId: 200, monsterType: "BARON_NASHOR" },
    );
    return t;
  }
  async function record(matchId: string, participants: MatchParticipantDetail[]) {
    await handle.db.insert(accountMatches).values({ accountId, matchId, gameCreation: Date.now() - 86_400_000, queueId: 420, championId: "Ahri", role: "MID", win: true, patch: "16.20", gameDuration: 1200 });
    await handle.db.insert(matchDetails).values({ matchId, platform: "oc1", queueId: 420, gameCreation: Date.now() - 86_400_000, gameDuration: 1200, gameVersion: "16.20.1", teams: [], participants });
  }
  /** A timeline kept before kills and objectives were: no events, no kill times. */
  async function dated(matchId: string) {
    await record(matchId, players(matchId));
    const row = timelineRow(matchId, "oc1", eventful(matchId));
    await handle.db.insert(matchTimelines).values({ matchId, platform: "oc1", participants: row.participants.map(({ puuid, purchases, skills }) => ({ puuid, purchases, skills })), frames: row.frames });
  }
  const answering = (status: number, calls: string[], body: (matchId: string) => RiotMatchTimeline = eventful) =>
    new RiotApiClient({
      apiKey: "k",
      maxRetries: 0,
      limiter: new RateLimiter([{ requests: 1000, seconds: 1 }]),
      sleep: async () => {},
      fetchImpl: async (input: string | URL | Request) => {
        const url = String(input);
        calls.push(url);
        const matchId = url.split("/matches/")[1]!.split("/")[0]!;
        return status === 200
          ? new Response(JSON.stringify(body(matchId)), { status: 200, headers: { "content-type": "application/json" } })
          : new Response(JSON.stringify({ status: { message: "no" } }), { status, headers: { "content-type": "application/json", "retry-after": "1" } });
      },
    });

  beforeAll(async () => {
    handle = await testDb();
    const db = handle.db;
    await syncStaticData(db, new FixtureStaticProvider(), { fingerprint: false });
    const team = await getOrCreateTeam(db);
    owner = (await createPlayer(db, team.id, { displayName: "Events", primaryRole: "MID", primaryPool: ["Ahri"] })).id;
    accountId = (await addAccount(db, { ownerType: "player", playerId: owner, riotId: "Events#OCE", platform: "oc1", puuid: "me" })).id;
    await record("OC1_EVENTS", players("OC1_EVENTS"));
    await db.insert(matchTimelines).values(timelineRow("OC1_EVENTS", "oc1", eventful("OC1_EVENTS")));
    // The same game with a removed (erased) player on red.
    await record("OC1_EV_REMOVED", players("OC1_EV_REMOVED").map((p) => (p.puuid === "OC1_EV_REMOVED-r-TOP" ? { ...p, puuid: "", name: null, position: null, removed: true as const } : p)));
    await db.insert(matchTimelines).values(timelineRow("OC1_EV_REMOVED", "oc1", eventful("OC1_EV_REMOVED")));
    await dated("OC1_DATED");
    await dated("OC1_DATED_BUSY");
    await dated("OC1_DATED_GONE");
  }, 60_000);
  afterAll(async () => {
    await handle.close();
  });

  it("places each objective by the team that took it, from the player's side, with every kill of each team and the player's own", async () => {
    const r = await getMatchTimeline(handle.db, owner, "OC1_EVENTS");
    if (r.status !== "ok") throw new Error(r.message);
    const events = r.timeline.events!;
    expect(events.objectives).toEqual([
      { minute: 6, own: true, kind: "dragon", detail: "FIRE" },
      { minute: 10, own: false, kind: "grubs", detail: null },
      { minute: 700_000 / 60_000, own: true, kind: "tower", detail: "TOP OUTER" },
      { minute: 1_000_000 / 60_000, own: false, kind: "baron", detail: null },
    ]);
    // The execution counts as a death, not as a kill for anyone.
    expect(events.kills).toEqual({ own: [5], enemy: [7] });
    expect(events.you).toEqual({ kills: [5], deaths: [7], assists: [] });
    expect(r.timeline.eventsNote).toBeNull();
  });

  it("shows no team kills when a player was removed (their kills are not kept), and still the player's own", async () => {
    const r = await getMatchTimeline(handle.db, owner, "OC1_EV_REMOVED");
    if (r.status !== "ok") throw new Error(r.message);
    expect(r.timeline.events!.kills).toBeNull();
    expect(r.timeline.events!.you).toEqual({ kills: [5], deaths: [7], assists: [] });
    expect(r.timeline.events!.objectives).toHaveLength(4);
  });

  it("fetches a timeline kept before kills and objectives were once more, keeps them, and asks no more", async () => {
    const calls: string[] = [];
    const client = answering(200, calls);
    // Not asked for: said so, and the rest of the timeline shows.
    const before = await getMatchTimeline(handle.db, owner, "OC1_DATED");
    if (before.status !== "ok") throw new Error(before.message);
    expect(before.timeline.events).toBeNull();
    expect(before.timeline.eventsNote).toContain("not loaded yet");
    expect(before.timeline.gold).toHaveLength(21);
    const r = await getMatchTimeline(handle.db, owner, "OC1_DATED", { fetch: true, client });
    if (r.status !== "ok") throw new Error(r.message);
    expect(r.timeline.events!.kills).toEqual({ own: [5], enemy: [7] });
    expect(r.timeline.build).not.toBeNull();
    await getMatchTimeline(handle.db, owner, "OC1_DATED", { fetch: true, client });
    expect(calls).toHaveLength(1);
    const [row] = await handle.db.select().from(matchTimelines).where(eq(matchTimelines.matchId, "OC1_DATED"));
    expect(row!.events!.objectives).toHaveLength(4);
    expect(row!.participants.find((p) => p.puuid === "me")).toMatchObject({ kills: [300_000], deaths: [420_000] });
  });

  it("keeps showing the stored timeline when Riot is busy, says so, and asks again next time", async () => {
    const calls: string[] = [];
    const r = await getMatchTimeline(handle.db, owner, "OC1_DATED_BUSY", { fetch: true, client: answering(429, calls) });
    if (r.status !== "ok") throw new Error(r.message);
    expect(r.timeline.events).toBeNull();
    expect(r.timeline.eventsNote).toContain("limiting requests");
    expect(r.timeline.gold).toHaveLength(21);
    const [row] = await handle.db.select().from(matchTimelines).where(eq(matchTimelines.matchId, "OC1_DATED_BUSY"));
    expect(row!.events).toBeNull();
    const again = await getMatchTimeline(handle.db, owner, "OC1_DATED_BUSY", { fetch: true, client: answering(200, calls) });
    expect(again.status === "ok" && again.timeline.events?.objectives).toHaveLength(4);
  });

  it("remembers when Riot no longer provides the timeline, keeping what was stored", async () => {
    const calls: string[] = [];
    const r = await getMatchTimeline(handle.db, owner, "OC1_DATED_GONE", { fetch: true, client: answering(404, calls) });
    if (r.status !== "ok") throw new Error(r.message);
    expect(r.timeline.events).toBeNull();
    expect(r.timeline.eventsNote).toBeNull();
    expect(r.timeline.build).not.toBeNull();
    await getMatchTimeline(handle.db, owner, "OC1_DATED_GONE", { fetch: true, client: answering(404, calls) });
    expect(calls).toHaveLength(1);
    const [row] = await handle.db.select().from(matchTimelines).where(eq(matchTimelines.matchId, "OC1_DATED_GONE"));
    expect(row!.events).toEqual({ objectives: [], missing: true });
    expect(row!.participants).toHaveLength(10);
  });

  it("never empties a stored timeline: an answer without the players keeps what was kept and adds the objectives", async () => {
    await dated("OC1_DATED_EMPTY");
    const calls: string[] = [];
    const playerless = (matchId: string): RiotMatchTimeline => {
      const t = eventful(matchId);
      return { ...t, metadata: { ...t.metadata, participants: [] }, info: { ...t.info, participants: [], frames: t.info.frames.map((f) => ({ ...f, participantFrames: {} })) } };
    };
    const r = await getMatchTimeline(handle.db, owner, "OC1_DATED_EMPTY", { fetch: true, client: answering(200, calls, playerless) });
    if (r.status !== "ok") throw new Error(r.message);
    expect(calls).toHaveLength(1);
    expect(r.timeline.gold).toHaveLength(21);
    expect(r.timeline.build).not.toBeNull();
    expect(r.timeline.events!.objectives).toHaveLength(4);
    // No kill times were kept for anyone, so none are shown.
    expect(r.timeline.events!.kills).toBeNull();
    expect(r.timeline.events!.you).toBeNull();
    const [row] = await handle.db.select().from(matchTimelines).where(eq(matchTimelines.matchId, "OC1_DATED_EMPTY"));
    expect(row!.participants).toHaveLength(10);
    expect(row!.frames!.t).toHaveLength(21);
  });

  it("says when Riot access is not configured, without failing the timeline", async () => {
    await dated("OC1_DATED_NOKEY");
    const r = await getMatchTimeline(handle.db, owner, "OC1_DATED_NOKEY", { fetch: true, client: null });
    if (r.status !== "ok") throw new Error(r.message);
    expect(r.timeline.eventsNote).toContain("once Riot access is configured");
  });
});
