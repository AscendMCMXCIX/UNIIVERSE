import { describe, expect, it } from "vitest";
import type { DetailParticipant, DetailTeam } from "@/server/players/match-history";
import type { TimelinePlayerView } from "@/server/accounts/match-timeline";
import { gameScoresOf, participantOf, scoreInputsOf } from "./performance-inputs";

/* The opened game's record and timeline as the score reads them: nothing more is fetched. */

const POS = ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"];
function player(slot: number, over: Partial<DetailParticipant> = {}): DetailParticipant {
  return {
    slot, removed: false, name: `P${slot}#X`, rank: null, isPlayer: slot === 2, teamMember: null, memberId: null, opgg: null, championId: "Ahri", champLevel: 15, position: POS[slot % 5]!,
    kills: 3 + (slot % 4), deaths: 4, assists: 6 + (slot % 3), kda: 2, killParticipation: 0.5, cs: 150 + slot * 10, csPerMin: 6, gold: 10_000 + slot * 300, goldPerMin: 400, damage: 15_000 + slot * 1_000, damagePerMin: 600, damageShare: 0.2, damageTaken: 18_000, vision: 20 + slot, visionPerMin: 0.8, wardsPlaced: 8 + slot,
    stats: { ccSeconds: 10 + slot, wardsKilled: 2, turretTakedowns: slot % 3, objectiveDamage: 5_000 + slot * 500, teamHealing: 100 * slot, teamShielding: 0, damageMitigated: 9_000 },
    items: null, spells: null, keystone: null, secondary: null, runePage: null, laneOpponentSlot: (slot + 5) % 10, win: slot < 5, ...over,
  };
}
const team = (teamId: number, win: boolean, parts: DetailParticipant[]): DetailTeam => ({ teamId, side: teamId === 100 ? "blue" : "red", win, kills: parts.reduce((n, p) => n + p.kills, 0), gold: null, objectives: {}, bans: [], participants: parts });
const view = (over: Record<number, Partial<DetailParticipant>> = {}, queueId = 420) => ({
  queueId,
  durationS: 1_800,
  teams: [team(100, true, [0, 1, 2, 3, 4].map((s) => player(s, over[s]))), team(200, false, [5, 6, 7, 8, 9].map((s) => player(s, over[s])))],
});
const t = [0, 300_000, 600_000, 900_000, 1_200_000, 1_500_000, 1_800_000];
const timeline = (lead = 0): { players: TimelinePlayerView[]; t: number[] } => ({
  t,
  players: Array.from({ length: 10 }, (_, slot) => ({
    slot, path: [], skills: [],
    kills: Array.from({ length: 3 + (slot % 4) }, (_, k) => 700_000 + k * 100_000), deaths: [400_000, 800_000, 1_000_000, 1_300_000], assists: Array.from({ length: 6 + (slot % 3) }, (_, k) => 650_000 + k * 90_000),
    frames: { g: t.map((ms) => 500 + (ms / 60_000) * (380 + (slot === 2 ? lead : slot === 7 ? -lead : 0))), x: t.map((ms) => (ms / 60_000) * 450), c: t.map((ms) => (ms / 60_000) * 6) },
    lane: { opponentSlot: (slot + 5) % 10, moments: [] }, pair: null,
  })),
});

describe("the score's inputs from the opened game", () => {
  it("reads every player's figures, leaves out a removed player and reads positions only on the Rift", () => {
    const v = view({ 9: { removed: true } });
    const inputs = scoreInputsOf(v, null);
    expect(inputs.map((p) => p.slot)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    expect(inputs[2]).toMatchObject({ lane: "MIDDLE", counterpart: 7, ccSeconds: 12, laneDiff: null });
    const aram = scoreInputsOf(view({}, 450), null);
    expect(aram.every((p) => p.lane === null && p.counterpart === null)).toBe(true);
  });

  it("takes the lane from the timeline (10:00 and 15:00, gold plus experience) where it confirms one", () => {
    const inputs = scoreInputsOf(view(), timeline(100));
    // Mid ahead by 100 gold a minute: 1,000 at 10:00, 1,500 at 15:00, both ways.
    expect(inputs.find((p) => p.slot === 2)!.laneDiff).toBeCloseTo(2 * 1_250, 6);
    expect(inputs.find((p) => p.slot === 7)!.laneDiff).toBeCloseTo(-2 * 1_250, 6);
  });

  it("gives ten scores with one MVP and one ACE, and a timeline ending on the final scores", () => {
    const { scores, points } = gameScoresOf(view(), timeline(80));
    expect(scores!.players).toHaveLength(10);
    expect(scores!.players.filter((p) => p.mvp)).toHaveLength(1);
    expect(scores!.players.filter((p) => p.ace)).toHaveLength(1);
    for (const p of scores!.players) {
      expect(p.score).toBeGreaterThanOrEqual(0);
      expect(p.score).toBeLessThanOrEqual(10);
    }
    expect(points!.map((p) => p.minute)).toEqual([5, 10, 15, 20, 25, 30]);
    expect(points!.at(-1)!.scores[2]).toBe(scores!.players.find((p) => p.slot === 2)!.score);
  });

  it("without a timeline: final scores alone, no lane and no points", () => {
    const { scores, points } = gameScoresOf(view(), null);
    expect(scores!.components).not.toContain("lane");
    expect(points).toBeNull();
  });

  it("leaves kill figures out of the timeline's moments when a removed player's kills are missing", () => {
    const { points } = gameScoresOf(view({ 9: { removed: true } }), timeline());
    for (const p of points!.slice(0, -1)) expect(p.components.some((k) => k === "kp" || k === "kda" || k === "deaths")).toBe(false);
  });

  it("finds a participant by place in the record", () => {
    expect(participantOf(view(), 7)!.slot).toBe(7);
    expect(participantOf(view(), 12)).toBeNull();
  });
});
