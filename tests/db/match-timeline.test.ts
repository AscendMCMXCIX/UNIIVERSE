import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";
import { accountMatches, matchTimelines } from "@/server/db/schema";
import { FixtureStaticProvider } from "@/server/riot/static/fixture";
import { syncStaticData } from "@/server/riot/static/sync";
import { createPlayer, getOrCreateTeam } from "@/server/repositories/team";
import { addAccount } from "@/server/accounts/repository";
import { buildSteps, getMatchBuild, maxOrderOf, timelineFrames, timelineParticipants } from "@/server/accounts/match-timeline";
import { RiotApiClient } from "@/server/riot/api/client";
import { RateLimiter } from "@/server/riot/api/rate-limiter";
import type { RiotMatchTimeline } from "@/server/riot/api/schemas";

/* Build and skill order from Riot's match timeline: read correctly, fetched once on demand, never guessed. */

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
            // Kill events name the victim (and killer), not a participantId.
            { type: "CHAMPION_KILL", timestamp: 520_000, victimId: 2 },
            { type: "CHAMPION_KILL", timestamp: 910_000, victimId: 1 },
            { type: "CHAMPION_KILL", timestamp: 480_000, victimId: 2 },
          ],
        },
      ],
    },
  };
}

describe("reading a timeline", () => {
  it("keeps purchases in order, removes undone ones, and records skill level-ups (not evolutions) and death times", () => {
    const [me, other] = timelineParticipants(timeline("OC1_T", ["p1", "p2"]));
    expect(me).toEqual({ puuid: "p1", purchases: [[2_000, 1055], [2_500, 2003], [2_600, 2003], [402_000, 1036]], skills: [1, 3, 2], deaths: [910_000] });
    expect(other).toEqual({ puuid: "p2", purchases: [[3_000, 1056]], skills: [], deaths: [480_000, 520_000] });
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
    ]);
    await db.insert(matchTimelines).values({ matchId: "OC1_T", platform: "oc1", participants: timelineParticipants(timeline("OC1_T", ["p1", "p2"])) });
  }, 60_000);
  afterAll(async () => {
    await handle.close();
  });

  it("shows a stored build without asking Riot", async () => {
    const r = await getMatchBuild(handle.db, owner, "OC1_T", { fetch: true, client: null });
    expect(r.status).toBe("ok");
    if (r.status !== "ok") return;
    expect(r.build.steps.map((s) => s.minute)).toEqual([0, 6]);
    expect(r.build.steps[0]!.items.find((i) => i.id === 2003)?.count).toBe(2);
    expect(r.build.skills).toEqual(["Q", "E", "W"]);
  });

  it("only for the player's own stored games", async () => {
    expect((await getMatchBuild(handle.db, stranger, "OC1_T")).status).toBe("not-found");
    expect((await getMatchBuild(handle.db, owner, "OC1_OTHER")).status).toBe("not-found");
  });

  it("says plainly when Riot access is not configured, and never guesses from the final items", async () => {
    expect(await getMatchBuild(handle.db, owner, "OC1_NEW", { fetch: true, client: null })).toMatchObject({ status: "not-configured" });
    expect(await getMatchBuild(handle.db, owner, "OC1_NEW")).toMatchObject({ status: "unavailable" });
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
    expect((await getMatchBuild(handle.db, owner, "OC1_NEW", { fetch: true, client })).status).toBe("ok");
    expect((await getMatchBuild(handle.db, owner, "OC1_NEW", { fetch: true, client })).status).toBe("ok");
    expect(calls.filter((u) => u.includes("OC1_NEW"))).toHaveLength(1);
    expect(calls[0]).toContain("sea.api.riotgames.com/lol/match/v5/matches/OC1_NEW/timeline");
    expect((await getMatchBuild(handle.db, owner, "OC1_GONE", { fetch: true, client })).status).toBe("unavailable");
    expect((await getMatchBuild(handle.db, owner, "OC1_GONE", { fetch: true, client })).status).toBe("unavailable");
    expect(calls.filter((u) => u.includes("OC1_GONE"))).toHaveLength(1);
  });
});
