import { describe, expect, it } from "vitest";
import type { MatchParticipantDetail } from "@/server/db/schema";
import type { StoredScoreTimeline } from "@/server/accounts/match-timeline";
import { removedParticipant } from "@/server/privacy/redact";
import { finalScoresOf } from "@/domain/performance-inputs";
import { cardPerformance, recordTeamsOf, scoreFiguresOf, scoreRecordOf } from "./match-history";

/*
  The record's mapping the performance score reads, shared by the opened game (getMatchDetail) and
  Match History's cards (cardPerformance), and the card's rule for when it can show the opened
  game's score: tests/db/card-score.test.ts compares the two on stored games.
*/

const POS = ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"];
/** Each place's position, not in lane order (the profile's player, place 2, is blue's mid; red's mid is place 5). */
const ORDER = [4, 1, 2, 0, 3, 2, 0, 4, 3, 1];
const part = (slot: number, over: Partial<MatchParticipantDetail> = {}): MatchParticipantDetail => ({
  puuid: `p${slot}`, name: `P${slot}#X`, teamId: slot < 5 ? 100 : 200, championId: "Ahri", championKey: 103, champLevel: 15, position: POS[ORDER[slot]!]!, win: slot >= 5,
  kills: 2 + (slot % 4), deaths: 3, assists: 5 + (slot % 3), cs: 140 + slot * 9, gold: 9_000 + slot * 250, damage: 14_000 + slot * 900, damageTaken: 17_000, vision: 18 + slot, wardsPlaced: 7 + slot,
  items: null, spells: null, runes: null, stats: { ccSeconds: 9 + slot, wardsKilled: 2, turretTakedowns: slot % 3, objectiveDamage: 4_000 + slot * 400, teamHealing: 50 * slot, teamShielding: 0, damageMitigated: 8_000, soloKills: 1 },
  ...over,
});
// Stored blue first; the red side won.
const record = (over: Record<number, Partial<MatchParticipantDetail>> = {}, queueId = 420) => ({
  queueId, gameDuration: 1_800,
  participants: Array.from({ length: 10 }, (_, s) => part(s, over[s])),
  teams: [{ teamId: 100, win: false, objectives: { champion: 99 } }, { teamId: 200, win: true, objectives: { champion: 98 } }],
});
const t = [0, 300_000, 600_000, 900_000, 1_200_000, 1_500_000, 1_800_000];
const stored = (d: ReturnType<typeof record>, over: Partial<StoredScoreTimeline> = {}): StoredScoreTimeline => ({
  available: true, dated: false, t,
  seats: d.participants.map((p, i) => ({ kept: !!p.puuid, frames: p.puuid ? { g: t.map((ms) => 500 + (ms / 60_000) * (390 + (i === 2 ? 60 : 0))), x: t.map((ms) => (ms / 60_000) * 440) } : null })),
  ...over,
});
const own = new Set(["p2"]);

describe("the record as the score reads it", () => {
  it("gives each player's place, figures, position and lane opponent", () => {
    const d = record();
    const mid = d.participants[2]!;
    expect(scoreFiguresOf(d.participants, mid)).toMatchObject({ slot: 2, removed: false, position: "MIDDLE", kills: mid.kills, cs: mid.cs, laneOpponentSlot: 5, stats: { ccSeconds: 11, damageMitigated: 8_000 } });
    // Only the figures the opened game shows: Riot's other extras stay out.
    expect(scoreFiguresOf(d.participants, mid).stats).not.toHaveProperty("doubleKills");
  });

  it("orders the teams from the player's side, each in lane order, with the record's result and kills", () => {
    const d = record();
    const red = recordTeamsOf(d.participants, d.teams, 200);
    expect(red.map((x) => x.teamId)).toEqual([200, 100]);
    expect(red[0]!.members.map((p) => p.position)).toEqual(POS);
    expect(red.map((x) => [x.win, x.kills])).toEqual([[true, d.participants.filter((p) => p.teamId === 200).reduce((n, p) => n + p.kills, 0)], [false, d.participants.filter((p) => p.teamId === 100).reduce((n, p) => n + p.kills, 0)]]);
    expect(recordTeamsOf(d.participants, d.teams, 100).map((x) => x.teamId)).toEqual([100, 200]);
    // A removed player's kills are not kept: the team's count is the record's total.
    const gone = record({ 8: removedParticipant(part(8)) });
    expect(recordTeamsOf(gone.participants, gone.teams, 100).find((x) => x.teamId === 200)!.kills).toBe(98);
  });
});

describe("a card's performance", () => {
  const scored = (d: ReturnType<typeof record>, me: MatchParticipantDetail, tl: StoredScoreTimeline | undefined, riot = true) => cardPerformance({ d, me, record: scoreRecordOf(d, me) }, tl, own, riot);

  it("is the game's final score for the player, with the lane from the stored timeline", () => {
    const d = record();
    const me = d.participants[2]!;
    const result = scored(d, me, stored(d));
    expect(result).toMatchObject({ state: "ok", of: 10, version: "v3" });
    const plain = finalScoresOf(scoreRecordOf(d, me), null)!.players.find((p) => p.slot === 2)!;
    // Sixty gold a minute ahead in lane counts: higher than without the timeline.
    expect(result.state === "ok" && result.score).toBeGreaterThan(plain.score);
  });

  it("waits for a Summoner's Rift game's timeline where the opened game would fetch it, and only there", () => {
    const d = record();
    const me = d.participants[2]!;
    expect(scored(d, me, undefined)).toEqual({ state: "pending" });
    expect(scored(d, me, stored(d, { dated: true, t: null }))).toEqual({ state: "pending" });
    // Without Riot access nothing is fetched: the stored record alone, as the opened game scores it.
    expect(scored(d, me, undefined, false)).toMatchObject({ state: "ok" });
    // Dated with its frames: kept as they are when fetched again.
    expect(scored(d, me, stored(d, { dated: true }))).toEqual(scored(d, me, stored(d)));
    // Riot no longer provides it: final, scored without the lane.
    expect(scored(d, me, { available: false, dated: false, t: null, seats: [] })).toEqual(scored(d, me, undefined, false));
    // ARAM reads no timeline.
    const aram = record({}, 450);
    expect(scored(aram, aram.participants[2]!, undefined)).toMatchObject({ state: "ok" });
  });

  it("has no score for a removed player or without a record", () => {
    const d = record({ 2: removedParticipant(part(2)) });
    expect(scored(d, d.participants[2]!, stored(d))).toEqual({ state: "none" });
    expect(cardPerformance(null, undefined, own, true)).toEqual({ state: "none" });
  });

  it("scores the others of a game with a removed player out of nine", () => {
    const d = record({ 8: removedParticipant(part(8)) });
    expect(scored(d, d.participants[2]!, stored(d))).toMatchObject({ state: "ok", of: 9 });
  });
});
