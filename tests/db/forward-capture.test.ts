import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { makeSeason2026Current, testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";
import { FixtureStaticProvider } from "@/server/riot/static/fixture";
import { syncStaticData } from "@/server/riot/static/sync";
import { createPlayer, getOrCreateTeam } from "@/server/repositories/team";
import { addAccount, listAccountsForPlayer } from "@/server/accounts/repository";
import { syncAccount } from "@/server/accounts/sync";
import { getMatchTimeline, timelineRow } from "@/server/accounts/match-timeline";
import { matchDetailRow } from "@/server/accounts/match-details";
import { LANE_CHALLENGE_KEYS, matchSchema, matchTimelineSchema } from "@/server/riot/api/schemas";
import { RiotApiClient } from "@/server/riot/api/client";
import { RateLimiter } from "@/server/riot/api/rate-limiter";
import { accountMatches, matchDetails, matchTimelines, type MatchEvents, type MatchFrames, type MatchParticipantDetail, type MatchTimelineParticipant } from "@/server/db/schema";
import { riotGame, type RiotGameFixture } from "../fixtures/riot-game";
import { withCaptureFields } from "../fixtures/riot-game-capture";
import fixture from "@/server/riot/fixtures/champions.fixture.json";

/*
  Forward capture (20 Nov 2026): a game folded through the real account sync and its timeline
  through the real timeline request keep, for every player, Riot's two positions, the stat shards,
  the ten lane and jungle figures and the support and tank figures, and per frame each player's
  place, ability haste and level, with the level-up times, sales, items used up and turret plates.
  The fold names the lane opponent by the one rule. And what the new fields cost, measured on games
  shaped like Riot's (tests/fixtures/riot-game-capture) against the same games as compaction kept
  them before.
*/

const players = [
  { puuid: "fc-blue-top", gameName: "Ridgeline", tagLine: "OCE", champion: "Gwen" },
  { puuid: "fc-blue-jgl", gameName: "Canopy", tagLine: "OCE", champion: "Nocturne" },
  { puuid: "fc-blue-mid", gameName: "Member Blue", tagLine: "OCE", champion: "Ahri" },
  { puuid: "fc-blue-adc", gameName: "Longbow", tagLine: "OCE", champion: "Jinx" },
  { puuid: "fc-blue-sup", gameName: "Lantern", tagLine: "OCE", champion: "Thresh" },
  { puuid: "fc-red-top", gameName: "Anvil", tagLine: "OCE", champion: "Darius" },
  { puuid: "fc-red-jgl", gameName: "Thicket", tagLine: "OCE", champion: "Graves" },
  { puuid: "fc-red-mid", gameName: "Member Red", tagLine: "OCE", champion: "Syndra" },
  { puuid: "fc-red-adc", gameName: "Arrowhead", tagLine: "OCE", champion: "Caitlyn" },
  { puuid: "fc-red-sup", gameName: "Bulwark", tagLine: "OCE", champion: "Leona" },
];
const MEMBER = players[2]!;
const keyToId = new Map(fixture.champions.map((c) => [Number(c.key), c.id]));
/** The game every field is checked on, and two whose positions decide the lane opponent. */
const FULL = "OC1_7400112233";
const ROAM = "OC1_7400112244";
const BLIND = "OC1_7400112255";

/** Riot's participants with some positions changed. */
function withPositions(game: RiotGameFixture, change: Record<string, { teamPosition: string; individualPosition: string }>): RiotGameFixture {
  const match = structuredClone(game.match) as { info: { participants: Array<Record<string, unknown>> } };
  for (const p of match.info.participants) if (change[String(p.puuid)]) Object.assign(p, change[String(p.puuid)]);
  return { ...game, match: match as unknown as Record<string, unknown> };
}

let handle: DbHandle;
let memberId: string;
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
    if (url.includes("/ids?")) return json(new URL(url).searchParams.get("queue") === "420" && Number(new URL(url).searchParams.get("start") ?? 0) === 0 ? [...games.keys()] : []);
    for (const [id, g] of games) {
      if (url.endsWith(`/lol/match/v5/matches/${id}/timeline`)) return json(g.timeline);
      if (url.endsWith(`/lol/match/v5/matches/${id}`)) return json(g.match);
    }
    return json({}, 404);
  };
}
const client = () => new RiotApiClient({ apiKey: "k", fetchImpl: fakeRiot(MEMBER.puuid), limiter: new RateLimiter([{ requests: 1000, seconds: 1 }]), sleep: async () => {} });

beforeAll(async () => {
  handle = await testDb();
  await syncStaticData(handle.db, new FixtureStaticProvider(), { fingerprint: false });
  await makeSeason2026Current(handle.db);
  const created = Date.now() - 3 * 3_600_000;
  games.set(FULL, withCaptureFields(riotGame({ matchId: FULL, players, winner: 100, durationS: 1_874, created })));
  // Red's jungler has no team position and roamed mid (individual MIDDLE): the old fold took them,
  // the first enemy in the merged position; Riot's team positions name one mid on each side.
  games.set(ROAM, withPositions(riotGame({ matchId: ROAM, players, winner: 200, durationS: 1_702, created: created - 3_600_000, seed: 41 }), { "fc-red-jgl": { teamPosition: "", individualPosition: "MIDDLE" } }));
  // No team positions at all (as when Riot cannot assign them), and two red players read mid in
  // isolation: no reliable lane opponent.
  const blind = Object.fromEntries(players.map((p, i) => [p.puuid, { teamPosition: "", individualPosition: ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"][i % 5]! }]));
  blind["fc-red-top"] = { teamPosition: "", individualPosition: "MIDDLE" };
  games.set(BLIND, withPositions(riotGame({ matchId: BLIND, players, winner: 100, durationS: 1_655, created: created - 7_200_000, seed: 43 }), blind));
  const team = await getOrCreateTeam(handle.db);
  memberId = (await createPlayer(handle.db, team.id, { displayName: "Member Blue", primaryRole: "MID", primaryPool: [MEMBER.champion] })).id;
  await addAccount(handle.db, { ownerType: "player", playerId: memberId, riotId: `${MEMBER.gameName}#${MEMBER.tagLine}`, platform: "oc1" });
  await syncAccount(handle.db, client(), (await listAccountsForPlayer(handle.db, memberId))[0]!);
}, 60_000);
afterAll(async () => {
  await handle.close();
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Riot's loose JSON, as the fixture wrote it
type RiotParticipantJson = Record<string, any>;

describe("a game folded from 20 Nov 2026 on", () => {
  it("keeps every player's two positions, stat shards, lane and jungle figures and support figures in its record", async () => {
    const [d] = await handle.db.select({ participants: matchDetails.participants }).from(matchDetails).where(eq(matchDetails.matchId, FULL));
    const riot = (games.get(FULL)!.match as { info: { participants: RiotParticipantJson[] } }).info.participants;
    expect(d!.participants).toHaveLength(10);
    d!.participants.forEach((p, i) => {
      const r = riot[i]!;
      expect(p).toMatchObject({ teamPosition: r.teamPosition, individualPosition: r.individualPosition, position: r.teamPosition });
      expect(p.runes?.shards).toEqual([r.perks.statPerks.offense, r.perks.statPerks.flex, r.perks.statPerks.defense]);
      expect(Object.keys(p.challenges!).sort()).toEqual([...LANE_CHALLENGE_KEYS].sort());
      for (const key of LANE_CHALLENGE_KEYS) expect(p.challenges![key]).toBeCloseTo(r.challenges[key], 2);
      expect(p.stats).toMatchObject({ deadSeconds: r.totalTimeSpentDead, teamHealing: r.totalHealsOnTeammates, teamShielding: r.totalDamageShieldedOnTeammates, damageMitigated: r.damageSelfMitigated, platesTaken: r.challenges.turretPlatesTaken });
    });
    // The member's own game row carries the support figures with the other extra figures.
    const [row] = await handle.db.select({ extra: accountMatches.extraStats }).from(accountMatches).where(eq(accountMatches.matchId, FULL));
    expect(row!.extra).toMatchObject({ deadSeconds: riot[2]!.totalTimeSpentDead, damageMitigated: riot[2]!.damageSelfMitigated });
  });

  it("keeps each player's place, ability haste and level at every frame, and the new timeline events", async () => {
    const r = await getMatchTimeline(handle.db, memberId, FULL, { fetch: true, client: client() });
    if (r.status !== "ok") throw new Error(r.message);
    const [row] = await handle.db.select().from(matchTimelines).where(eq(matchTimelines.matchId, FULL));
    const frames = row!.frames!;
    const riotFrames = (games.get(FULL)!.timeline as { info: { frames: Array<{ participantFrames: Record<string, RiotParticipantJson> }> } }).info.frames;
    players.forEach((p, i) => {
      const f = frames.p[p.puuid]!;
      const riot = riotFrames.map((rf) => rf.participantFrames[String(i + 1)]!);
      expect(f.px).toEqual(riot.map((x) => x.position.x));
      expect(f.py).toEqual(riot.map((x) => x.position.y));
      expect(f.ah).toEqual(riot.map((x) => x.championStats.abilityHaste));
      expect(f.lv).toEqual(riot.map((x) => x.level));
    });
    const by = new Map(row!.participants.map((p) => [p.puuid, p]));
    for (const p of players) {
      const e = by.get(p.puuid)!;
      const lv = frames.p[p.puuid]!.lv!;
      // The level-up times agree with the level at every frame.
      expect(e.levels).toHaveLength(lv.at(-1)! - 1);
      frames.t.forEach((t, k) => expect(1 + e.levels!.filter((ms) => ms <= t).length).toBe(lv[k]));
      expect(e.destroyed!.length).toBeGreaterThan(3);
      // The undone purchase is gone.
      expect(e.purchases.some(([, id]) => id === 1053)).toBe(false);
    }
    // Every laner and jungler sold the starting item; supports' turns into the next one.
    expect([...by.values()].filter((e) => e.sold?.length)).toHaveLength(8);
    const plates = row!.events!.plates!;
    expect(plates).toHaveLength(13);
    expect(plates.every((x) => (x.team === 100 || x.team === 200) && ["TOP", "MID", "BOT"].includes(x.lane))).toBe(true);
    // The page reads the lane at 10:00 from the gold, XP and CS series, as before.
    expect(r.timeline.lane!.moments[0]!.you).not.toBeNull();
  });
});

describe("the lane opponent the fold stores", () => {
  const enemyOf = async (matchId: string) => (await handle.db.select({ enemy: accountMatches.enemyChampionId }).from(accountMatches).where(eq(accountMatches.matchId, matchId)))[0]!.enemy;

  it("is the one enemy holding the player's team position", async () => {
    expect(await enemyOf(FULL)).toBe("Syndra");
    // Red's jungler read mid in isolation with no team position: only team positions are compared, so red's mid is the opponent (the old fold took the jungler).
    expect(await enemyOf(ROAM)).toBe("Syndra");
  });

  it("is nobody when the player has no team position and two enemies share the individual one", async () => {
    expect(await enemyOf(BLIND)).toBeNull();
    const [d] = await handle.db.select({ participants: matchDetails.participants }).from(matchDetails).where(eq(matchDetails.matchId, BLIND));
    expect(d!.participants.filter((p) => p.teamId === 200 && p.individualPosition === "MIDDLE")).toHaveLength(2);
  });
});

describe("what the new fields cost", () => {
  /** A record's players as compaction kept them before 20 Nov 2026 (the newer fields taken out). */
  function olderRecord(parts: MatchParticipantDetail[]): MatchParticipantDetail[] {
    return parts.map((p) => {
      const q: Record<string, unknown> = { ...p };
      delete q.teamPosition;
      delete q.individualPosition;
      delete q.challenges;
      const stats = { ...p.stats } as Record<string, unknown>;
      for (const k of ["deadSeconds", "platesTaken", "teamHealing", "teamShielding", "damageMitigated"]) delete stats[k];
      q.stats = stats;
      if (p.runes) {
        const runes = { ...p.runes } as Record<string, unknown>;
        delete runes.shards;
        q.runes = runes;
      }
      return q as unknown as MatchParticipantDetail;
    });
  }
  /** A timeline as compaction kept it before 20 Nov 2026. */
  const olderTimeline = (row: { participants: MatchTimelineParticipant[]; frames: MatchFrames; events: MatchEvents }) => ({
    participants: row.participants.map(({ puuid, purchases, skills, kills, deaths, assists }) => ({ puuid, purchases, skills, kills, deaths, assists })),
    frames: { t: row.frames.t, p: Object.fromEntries(Object.entries(row.frames.p).map(([k, { g, x, c }]) => [k, { g, x, c }])) },
    events: { objectives: row.events.objectives },
  });

  it("adds about 1 KB to a record and 130–180 bytes a minute to a timeline as stored, measured on games shaped like Riot's", async () => {
    const db = handle.db;
    await db.execute(sql`CREATE TABLE size_probe (id serial PRIMARY KEY, v jsonb)`);
    // As a column stores it: compressed (TOAST) when large, which a value in a query never is.
    const stored = async (v: unknown) => {
      const ins = (await db.execute(sql`INSERT INTO size_probe (v) VALUES (${JSON.stringify(v)}::jsonb) RETURNING id`)) as unknown as { rows?: Array<{ id: number }> } & Array<{ id: number }>;
      const id = (ins.rows ?? ins)[0]!.id;
      const res = (await db.execute(sql`SELECT pg_column_size(v) AS n FROM size_probe WHERE id = ${id}`)) as unknown as { rows?: Array<{ n: number }> } & Array<{ n: number }>;
      return Number((res.rows ?? res)[0]!.n);
    };
    const bytes = (v: unknown) => JSON.stringify(v).length;
    // The three columns of match_timelines are stored (and compressed) apart.
    const timelineStored = async (t: { participants: unknown; frames: unknown; events: unknown }) => (await stored(t.participants)) + (await stored(t.frames)) + (await stored(t.events));
    const out: Array<{ minutes: number; recordJson: number; recordStored: number; timelineJson: number; timelineStored: number }> = [];
    for (const durationS of [1_500, 1_850, 2_300]) {
      const game = withCaptureFields(riotGame({ matchId: `OC1_${durationS}`, players, winner: 100, durationS, created: Date.now() - 86_400_000 }), { seed: durationS });
      const match = matchSchema.parse(game.match);
      const record = matchDetailRow("oc1", match, keyToId).participants as MatchParticipantDetail[];
      const kept = timelineRow(match.metadata.matchId, "oc1", matchTimelineSchema.parse(game.timeline)) as { participants: MatchTimelineParticipant[]; frames: MatchFrames; events: MatchEvents };
      const old = olderTimeline(kept);
      out.push({
        minutes: Math.round(durationS / 60),
        recordJson: bytes(record) - bytes(olderRecord(record)),
        recordStored: (await stored(record)) - (await stored(olderRecord(record))),
        timelineJson: bytes(kept.participants) + bytes(kept.frames) + bytes(kept.events) - (bytes(old.participants) + bytes(old.frames) + bytes(old.events)),
        timelineStored: (await timelineStored(kept)) - (await timelineStored(old)),
      });
    }
    console.log(`forward capture, bytes added per game: ${JSON.stringify(out)}`);
    for (const m of out) {
      // Stored (what counts against the database's 500 MB): about 1 KB a record, 130–180 bytes a minute of timeline.
      expect(m.recordStored).toBeLessThan(1_200);
      expect(m.timelineStored / m.minutes).toBeLessThan(200);
      // As text (what reading a whole record or timeline sends): about 5 KB a record, 330–400 bytes a minute of timeline.
      expect(m.recordJson).toBeLessThan(5_500);
      expect(m.timelineJson / m.minutes).toBeLessThan(450);
    }
  });
});
