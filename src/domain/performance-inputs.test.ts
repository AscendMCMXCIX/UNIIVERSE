import { describe, expect, it } from "vitest";
import type { DetailParticipant, DetailTeam } from "@/server/players/match-history";
import type { TimelinePlayerView } from "@/server/accounts/match-timeline";
import { finalScoresOf, participantOf, scoreInputsOf, scoreReadsTimeline } from "./performance-inputs";

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
    frames: { g: t.map((ms) => 500 + (ms / 60_000) * (380 + (slot === 2 ? lead : slot === 7 ? -lead : 0))), x: t.map((ms) => (ms / 60_000) * 450) },
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

  it("gives ten scores with one MVP (the winning team's best) and one ACE (the losing team's best)", () => {
    const scores = finalScoresOf(view(), timeline(80))!;
    expect(scores.players).toHaveLength(10);
    const best = (teamId: number) => [...scores.players].filter((p) => p.teamId === teamId).sort((a, b) => b.raw - a.raw)[0]!.slot;
    expect(scores.players.filter((p) => p.mvp).map((p) => p.slot)).toEqual([best(100)]);
    expect(scores.players.filter((p) => p.ace).map((p) => p.slot)).toEqual([best(200)]);
    for (const p of scores.players) {
      expect(p.score).toBeGreaterThanOrEqual(0);
      expect(p.score).toBeLessThanOrEqual(10);
    }
  });

  it("without a timeline: final scores alone, no lane", () => {
    expect(finalScoresOf(view(), null)!.components).not.toContain("lane");
  });

  /*
    The final scores of these games as the code gave them before the score through the game was
    removed (25 Nov 2026: computed with gameScoresOf(...).scores on main 3aab01b and compared value
    for value): the removal changed no final score, place, MVP or ACE (still v3).
  */
  it("gives the same final scores as before the score through the game was removed", () => {
    const shown = (s: ReturnType<typeof finalScoresOf>) => s!.players.map((p) => [p.slot, p.score, p.rank, p.mvp, p.ace]);
    expect(shown(finalScoresOf(view(), timeline(80)))).toEqual([[0, 4.1, 6, false, false], [1, 4, 9, false, false], [2, 6.6, 1, true, false], [3, 5.5, 2, false, false], [4, 3.6, 10, false, false], [5, 5, 3, false, true], [6, 4, 8, false, false], [7, 4.7, 5, false, false], [8, 4.9, 4, false, false], [9, 4, 7, false, false]]);
    // Without a timeline the losing mid laner is the game's 1st, and its ACE.
    expect(shown(finalScoresOf(view(), null))).toEqual([[0, 3.9, 8, false, false], [1, 3.9, 9, false, false], [2, 5.7, 2, true, false], [3, 5.5, 3, false, false], [4, 3.5, 10, false, false], [5, 5, 4, false, false], [6, 4, 7, false, false], [7, 5.8, 1, false, true], [8, 4.9, 5, false, false], [9, 4, 6, false, false]]);
    expect(shown(finalScoresOf(view({ 9: { removed: true } }), timeline(40)))).toEqual([[0, 3.3, 8, false, false], [1, 3.4, 7, false, false], [2, 5.7, 1, true, false], [3, 4.6, 5, false, false], [4, 2.7, 9, false, false], [5, 5.7, 2, false, true], [6, 4.4, 6, false, false], [7, 5.2, 4, false, false], [8, 5.2, 3, false, false]]);
    expect(shown(finalScoresOf(view({}, 450), null))).toEqual([[0, 2.4, 10, false, false], [1, 4.2, 9, false, false], [2, 6, 2, true, false], [3, 6, 3, false, false], [4, 5.3, 6, false, false], [5, 4.8, 7, false, false], [6, 4.7, 8, false, false], [7, 6.5, 1, false, true], [8, 5.8, 4, false, false], [9, 5.6, 5, false, false]]);
  });

  it("finds a participant by place in the record", () => {
    expect(participantOf(view(), 7)!.slot).toBe(7);
    expect(participantOf(view(), 12)).toBeNull();
  });
});

describe("one calculation for the card and the opened game", () => {
  it("scores the opened game's timeline view and the card's trimmed timeline alike: gold and experience are all it reads", () => {
    const tl = timeline(90);
    const trimmed = { t: tl.t, players: tl.players.map((p) => ({ slot: p.slot, frames: p.frames ? { g: p.frames.g, x: p.frames.x } : null, lane: p.lane ? { opponentSlot: p.lane.opponentSlot } : null })) };
    expect(finalScoresOf(view(), trimmed)).toEqual(finalScoresOf(view(), tl));
    expect(finalScoresOf(view({ 9: { removed: true } }), trimmed)).toEqual(finalScoresOf(view({ 9: { removed: true } }), tl));
  });

  it("reads the timeline only for a Summoner's Rift game with a lane opponent", () => {
    expect(scoreReadsTimeline(view())).toBe(true);
    expect(scoreReadsTimeline(view({}, 450))).toBe(false);
    const noLanes = view(Object.fromEntries(Array.from({ length: 10 }, (_, s) => [s, { laneOpponentSlot: null }])));
    expect(scoreReadsTimeline(noLanes)).toBe(false);
    // Without a lane to read, the timeline changes nothing in the final score.
    expect(finalScoresOf(noLanes, timeline(90))).toEqual(finalScoresOf(noLanes, null));
    expect(finalScoresOf(view({}, 450), timeline(90))).toEqual(finalScoresOf(view({}, 450), null));
  });
});
