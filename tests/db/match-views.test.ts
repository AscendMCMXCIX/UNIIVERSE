import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";
import { FixtureStaticProvider } from "@/server/riot/static/fixture";
import { syncStaticData } from "@/server/riot/static/sync";
import { createPlayer, getOrCreateTeam } from "@/server/repositories/team";
import { addAccount, listAccountsForPlayer } from "@/server/accounts/repository";
import { syncAccount } from "@/server/accounts/sync";
import { getMatchTimeline } from "@/server/accounts/match-timeline";
import { getMatchDetail, getMatchHistory } from "@/server/players/match-history";
import { matchSchema, matchTimelineSchema } from "@/server/riot/api/schemas";
import { RiotApiClient } from "@/server/riot/api/client";
import { RateLimiter } from "@/server/riot/api/rate-limiter";
import { riotGame, type RiotGameFixture } from "../fixtures/riot-game";
import { matchViewConsistency } from "@/server/players/match-consistency";
import { seedDemoAccounts, seedDemoRoster } from "@/server/demo/seed";
import { applyDemoEncounters } from "@/server/demo/encounters-fixture";
import { matchDetails, matchTimelines, type MatchFrames } from "@/server/db/schema";
import { eq, like } from "drizzle-orm";

/*
  One game, every view. A realistic ranked game (tests/fixtures/riot-game: Riot's match and
  timeline JSON built from a script of kills, objectives and per-minute figures) is synced through
  the real account sync and timeline request for two team members who played on opposite sides.
  For each of them the match card, the scoreboard, the Analysis and the Timeline must tell the same
  game: the same kills, gold and objectives per team, the same figures for the player, and the
  gold difference at the end equal to the teams' recorded gold, seen from their own side.
*/

const MATCH = "OC1_7300112233";
/** A second game the blue member played, whose stored timeline the last test garbles. */
const SECOND = "OC1_7300112299";
const players = [
  { puuid: "pv-blue-top", gameName: "Ridgeline", tagLine: "OCE", champion: "Gwen" },
  { puuid: "pv-blue-jgl", gameName: "Canopy", tagLine: "OCE", champion: "Nocturne" },
  { puuid: "pv-blue-mid", gameName: "Member Blue", tagLine: "OCE", champion: "Ahri" },
  { puuid: "pv-blue-adc", gameName: "Longbow", tagLine: "OCE", champion: "Jinx" },
  { puuid: "pv-blue-sup", gameName: "Lantern", tagLine: "OCE", champion: "Thresh" },
  { puuid: "pv-red-top", gameName: "Anvil", tagLine: "OCE", champion: "Darius" },
  { puuid: "pv-red-jgl", gameName: "Thicket", tagLine: "OCE", champion: "Graves" },
  { puuid: "pv-red-mid", gameName: "Member Red", tagLine: "OCE", champion: "Syndra" },
  { puuid: "pv-red-adc", gameName: "Arrowhead", tagLine: "OCE", champion: "Caitlyn" },
  { puuid: "pv-red-sup", gameName: "Bulwark", tagLine: "OCE", champion: "Leona" },
];

let handle: DbHandle;
let game: RiotGameFixture;
let second: RiotGameFixture;
const members: Record<"blue" | "red", string> = { blue: "", red: "" };

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
    if (url.includes("/ids?")) return json(new URL(url).searchParams.get("queue") === "420" && Number(new URL(url).searchParams.get("start") ?? 0) === 0 ? [MATCH, SECOND] : []);
    for (const g of [game, second]) {
      const id = (g.match.metadata as { matchId: string }).matchId;
      if (url.endsWith(`/lol/match/v5/matches/${id}/timeline`)) return json(g.timeline);
      if (url.endsWith(`/lol/match/v5/matches/${id}`)) return json(g.match);
    }
    return json({}, 404);
  };
}
const clientFor = (puuid: string) => new RiotApiClient({ apiKey: "k", fetchImpl: fakeRiot(puuid), limiter: new RateLimiter([{ requests: 1000, seconds: 1 }]), sleep: async () => {} });

beforeAll(async () => {
  handle = await testDb();
  await syncStaticData(handle.db, new FixtureStaticProvider(), { fingerprint: false });
  game = riotGame({ matchId: MATCH, players, winner: 200, durationS: 1_874, created: Date.now() - 3 * 3_600_000 });
  second = riotGame({ matchId: SECOND, players, winner: 100, durationS: 1_602, created: Date.now() - 5 * 3_600_000, seed: 77 });
  const team = await getOrCreateTeam(handle.db);
  for (const side of ["blue", "red"] as const) {
    const p = players[side === "blue" ? 2 : 7]!;
    const player = await createPlayer(handle.db, team.id, { displayName: side === "blue" ? "Member Blue" : "Member Red", primaryRole: "MID", primaryPool: [p.champion] });
    await addAccount(handle.db, { ownerType: "player", playerId: player.id, riotId: `${p.gameName}#${p.tagLine}`, platform: "oc1" });
    await syncAccount(handle.db, clientFor(p.puuid), (await listAccountsForPlayer(handle.db, player.id))[0]!);
    members[side] = player.id;
  }
}, 60_000);
afterAll(async () => {
  await handle.close();
});

describe("the scripted game", () => {
  it("reads as Riot's own data: both answers pass the schemas and the match's figures are the timeline's", () => {
    const match = matchSchema.parse(game.match);
    const timeline = matchTimelineSchema.parse(game.timeline);
    const last = timeline.info.frames.at(-1)!;
    for (const p of match.info.participants) {
      const pid = timeline.info.participants.find((x) => x.puuid === p.puuid)!.participantId;
      expect(last.participantFrames![String(pid)]!.totalGold).toBe(p.goldEarned);
      expect(last.participantFrames![String(pid)]!.minionsKilled! + last.participantFrames![String(pid)]!.jungleMinionsKilled!).toBe(p.totalMinionsKilled! + p.neutralMinionsKilled!);
    }
    // One execution: a death nobody gets the kill for, so the losing side died once more than it was killed by players.
    expect(game.truth.players.filter((p) => p.teamId === 100).reduce((n, p) => n + p.deaths, 0)).toBe(game.truth.kills[200] + 1);
    expect(game.truth.players.filter((p) => p.teamId === 200).reduce((n, p) => n + p.deaths, 0)).toBe(game.truth.kills[100]);
  });
});

describe("one game, every view, from both sides", () => {
  for (const side of ["blue", "red"] as const) {
    it(`agrees across the card, scoreboard, Analysis and Timeline for the ${side} side`, async () => {
      const db = handle.db;
      const own: 100 | 200 = side === "blue" ? 100 : 200;
      const other: 100 | 200 = own === 100 ? 200 : 100;
      const truth = game.truth;
      const me = truth.players.find((p) => p.puuid === players[side === "blue" ? 2 : 7]!.puuid)!;
      const playerId = members[side];

      // The match card.
      const row = (await getMatchHistory(db, playerId, { per: 10 })).rows.find((r) => r.matchId === MATCH)!;
      expect(row).toBeDefined();
      expect([row.kills, row.deaths, row.assists]).toEqual([me.kills, me.deaths, me.assists]);
      expect(row.win).toBe(own === 200);
      expect(row.cs).toBe(me.cs);
      expect(row.killParticipation).toBeCloseTo((me.kills + me.assists) / truth.kills[own], 6);
      const teamDamage = truth.players.filter((p) => p.teamId === own).reduce((n, p) => n + p.damage, 0);
      expect(row.damageShare).toBeCloseTo(me.damage / teamDamage, 6);
      expect(row.teams?.side).toBe(side);

      // The scoreboard and the Analysis (one view, the game's record).
      const detail = await getMatchDetail(db, playerId, MATCH, { viewerIsOwner: true });
      expect(detail.status).toBe("ok");
      if (detail.status !== "ok") return;
      const v = detail.view;
      // The player's team first, on its own side.
      expect(v.teams.map((t) => t.teamId)).toEqual([own, other]);
      expect(v.teams[0]!.side).toBe(side);
      for (const t of v.teams) {
        const id = t.teamId as 100 | 200;
        expect(t.kills).toBe(truth.kills[id]);
        expect(t.gold).toBe(truth.gold[id]);
        expect(t.win).toBe(id === 200);
        expect(t.objectives.tower).toBe(truth.objectives[id].tower);
        expect(t.objectives.dragon).toBe(truth.objectives[id].dragon);
        expect(t.objectives.baron).toBe(truth.objectives[id].baron);
        expect(t.participants.map((x) => [x.kills, x.deaths, x.assists])).toEqual(t.participants.map((x) => truth.players.find((p) => p.puuid === players[x.slot]!.puuid)).map((p) => [p!.kills, p!.deaths, p!.assists]));
      }
      expect([v.player.kills, v.player.deaths, v.player.assists]).toEqual([me.kills, me.deaths, me.assists]);
      expect(v.player.killParticipation).toBeCloseTo(row.killParticipation!, 9);
      expect(v.player.damageShare).toBeCloseTo(row.damageShare!, 9);
      expect(v.player.gold).toBe(me.gold);
      expect(v.player.champLevel).toBe(me.level);
      const c = v.comparison;
      const total = (key: string) => c.teams.find((t) => t.key === key)!;
      expect([total("kills").own, total("kills").enemy]).toEqual([truth.kills[own], truth.kills[other]]);
      expect([total("gold").own, total("gold").enemy]).toEqual([truth.gold[own], truth.gold[other]]);
      expect([total("tower").own, total("tower").enemy]).toEqual([truth.objectives[own].tower, truth.objectives[other].tower]);
      expect([total("dragon").own, total("dragon").enemy]).toEqual([truth.objectives[own].dragon, truth.objectives[other].dragon]);
      expect([total("baron").own, total("baron").enemy]).toEqual([truth.objectives[own].baron, truth.objectives[other].baron]);
      expect(c.killParticipation).toBeCloseTo(row.killParticipation!, 9);
      expect(c.damageShare).toBeCloseTo(row.damageShare!, 9);
      expect(c.goldShare).toBeCloseTo(me.gold / truth.gold[own], 9);
      // The lane opponent is the other side's player in the same position.
      const opponent = truth.players.find((p) => p.teamId === other && p.position === "MIDDLE")!;
      expect(players[c.opponent!.slot]!.puuid).toBe(opponent.puuid);

      // The Timeline: fetched once from Riot (the first side to open it), then stored.
      const timeline = await getMatchTimeline(db, playerId, MATCH, { fetch: true, client: clientFor(players[0]!.puuid) });
      expect(timeline.status).toBe("ok");
      if (timeline.status !== "ok") return;
      const tl = timeline.timeline;
      expect(tl.gold).not.toBeNull();
      expect(tl.gold!.map((g) => Math.round(g.minute * 60_000))).toEqual(truth.frames);
      expect(tl.gold![0]!.diff).toBe(0);
      // The gold difference at the end is the teams' recorded gold, from the player's side.
      expect(tl.gold!.at(-1)!.diff).toBe(truth.gold[own] - truth.gold[other]);
      expect(tl.gold!.at(-1)!.diff).toBe(total("gold").own! - total("gold").enemy!);
      expect(tl.minutes).toBeCloseTo(1_874 / 60, 6);
      // Each team's kills on the timeline are the scoreboard's; the player's own kills and deaths are theirs.
      expect(tl.events!.kills!.own.length).toBe(truth.kills[own]);
      expect(tl.events!.kills!.enemy.length).toBe(truth.kills[other]);
      expect(tl.events!.you!.kills.length).toBe(me.kills);
      expect(tl.events!.you!.deaths.length).toBe(me.deaths);
      expect(tl.events!.you!.assists.length).toBe(me.assists);
      // Objectives taken, per side, as the record counts them (dragons include the Elder Dragon).
      const taken = (own: boolean, kinds: string[]) => tl.events!.objectives.filter((o) => o.own === own && kinds.includes(o.kind)).length;
      expect(taken(true, ["tower"])).toBe(truth.objectives[own].tower);
      expect(taken(false, ["tower"])).toBe(truth.objectives[other].tower);
      expect(taken(true, ["dragon", "elder"])).toBe(truth.objectives[own].dragon);
      expect(taken(false, ["dragon", "elder"])).toBe(truth.objectives[other].dragon);
      expect(taken(true, ["baron"])).toBe(truth.objectives[own].baron);
      expect(taken(true, ["inhibitor"])).toBe(truth.objectives[own].inhibitor);
      // The lane at the end: the players' recorded CS and gold.
      expect(tl.lane?.opponentSlot).toBe(c.opponent!.slot);
    });
  }

  it("shows the same game mirrored: one side's lead is the other side's deficit at every frame", async () => {
    const db = handle.db;
    const blue = await getMatchTimeline(db, members.blue, MATCH);
    const red = await getMatchTimeline(db, members.red, MATCH);
    if (blue.status !== "ok" || red.status !== "ok") throw new Error("timelines not stored");
    expect(blue.timeline.gold!.map((g) => g.diff)).toEqual(red.timeline.gold!.map((g) => 0 - g.diff));
    expect(blue.timeline.events!.kills!.own).toEqual(red.timeline.events!.kills!.enemy);
    // The two mid laners face each other: their lane differences at 10:00 and 15:00 are opposite.
    const lane = (r: typeof blue) => (r.status === "ok" ? r.timeline.lane!.moments : []);
    for (const [b, r] of lane(blue).map((m, i) => [m, lane(red)[i]!] as const)) {
      expect(b.minute).toBe(r.minute);
      expect(b.you?.gold).toBe(r.opponent?.gold);
      expect(b.you?.cs).toBe(r.opponent?.cs);
    }
  });
});

describe("the record and the timeline in storage (the data audit's check)", () => {
  it("finds them in agreement, and a timeline that tells another game is caught and not drawn", async () => {
    const db = handle.db;
    // The second game's timeline, stored, then garbled: each blue player's frames swapped with the red player's in the same position.
    expect((await getMatchTimeline(db, members.blue, SECOND, { fetch: true, client: clientFor(players[2]!.puuid) })).status).toBe("ok");
    const fine = await matchViewConsistency(db);
    expect(fine).toMatchObject({ timelines: 2, complete: 2, contradicting: 0, playersGoldOff: 0, playersCsOff: 0, playersKillsOff: 0, withObjectives: 2, objectivesOff: 0 });
    expect(fine.largestGap).toBe(0);
    const [row] = await db.select({ frames: matchTimelines.frames }).from(matchTimelines).where(eq(matchTimelines.matchId, SECOND));
    const frames = row!.frames as MatchFrames;
    const swapped: MatchFrames["p"] = {};
    for (let i = 0; i < 5; i++) {
      swapped[players[i]!.puuid] = frames.p[players[i + 5]!.puuid]!;
      swapped[players[i + 5]!.puuid] = frames.p[players[i]!.puuid]!;
    }
    await db.update(matchTimelines).set({ frames: { t: frames.t, p: swapped } }).where(eq(matchTimelines.matchId, SECOND));
    const off = await matchViewConsistency(db);
    expect(off.contradicting).toBe(1);
    expect(off.playersGoldOff).toBeGreaterThanOrEqual(8);
    expect(off.largestGap).toBe(2 * Math.abs(second.truth.gold[100] - second.truth.gold[200]));
    // The Timeline does not draw it, and says why; the record's views are unchanged.
    const garbled = await getMatchTimeline(db, members.blue, SECOND);
    if (garbled.status !== "ok") throw new Error("timeline missing");
    expect(garbled.timeline.gold).toBeNull();
    expect(garbled.timeline.goldNote).toBe("contradicts");
    expect(garbled.timeline.lane).toBeNull();
    const detail = await getMatchDetail(db, members.blue, SECOND, { viewerIsOwner: true });
    if (detail.status !== "ok") throw new Error("detail missing");
    expect(detail.view.teams.find((t) => t.teamId === 100)!.gold).toBe(second.truth.gold[100]);
  });
});

describe("the demo's games (demo mode only)", () => {
  let demo: DbHandle;
  beforeAll(async () => {
    demo = await testDb();
    await syncStaticData(demo.db, new FixtureStaticProvider(), { fingerprint: false });
    await seedDemoRoster(demo.db);
    await seedDemoAccounts(demo.db);
    await applyDemoEncounters(demo.db);
  }, 120_000);
  afterAll(async () => {
    await demo.close();
  });

  it("tell the same game in their record and their timeline, on both sides", async () => {
    const audit = await matchViewConsistency(demo.db);
    expect(audit.complete).toBeGreaterThan(100);
    expect(audit).toMatchObject({ contradicting: 0, playersGoldOff: 0, playersCsOff: 0, playersKillsOff: 0, objectivesOff: 0, largestGap: 0 });
    // Some members' games are on the red side, so the views are seen from both sides.
    const games = await demo.db.select({ participants: matchDetails.participants, matchId: matchDetails.matchId }).from(matchDetails).where(like(matchDetails.matchId, "DEMO\\_%"));
    const sides = new Set(games.map((g) => g.participants.find((p) => p.puuid.startsWith(`demo-${g.matchId.split("_")[1]}`))?.teamId).filter(Boolean));
    expect([...sides].sort()).toEqual([100, 200]);
    // Every side's deaths are the other side's kills (the demo has no executions).
    for (const g of games) {
      if (g.participants.length !== 10) continue;
      const sum = (team: number, key: "kills" | "deaths") => g.participants.filter((p) => p.teamId === team).reduce((n, p) => n + p[key], 0);
      expect(sum(100, "deaths")).toBe(sum(200, "kills"));
      expect(sum(200, "deaths")).toBe(sum(100, "kills"));
    }
  });
});
