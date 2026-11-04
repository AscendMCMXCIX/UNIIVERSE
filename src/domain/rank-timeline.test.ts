import { describe, expect, it } from "vitest";
import { ladderGrid, rankTimeline, timelineReadings } from "./rank-timeline";
import type { RankSnapshot } from "./rank-progress";

const D = (m: number, d: number, h = 12) => Date.UTC(2026, m - 1, d, h);
const snap = (at: number, tier: string | null, division: string | null, lp: number | null, wins: number | null, losses: number | null, confirmedAt?: number): RankSnapshot => ({ queue: "solo", tier, division, leaguePoints: lp, wins, losses, capturedAt: at, confirmedAt: confirmedAt ?? null });
const NOW = D(11, 4);

describe("rankTimeline", () => {
  const readings = [
    snap(D(10, 15), "GOLD", "II", 46, 100, 90, D(10, 15, 20)),
    snap(D(10, 16), "GOLD", "II", 70, 101, 90), // one game: a step
    snap(D(10, 18), "GOLD", "I", 12, 104, 91, D(10, 18, 18)), // four games: a gap, a promotion "between"
    snap(D(10, 20), "GOLD", "II", 75, 104, 92), // one game: an exact demotion
  ];

  it("covers the whole 2026 ranked year by default and says where recording began", () => {
    const t = rankTimeline(readings, [], "year", NOW);
    expect(t.from).toBe(Date.UTC(2026, 0, 8));
    expect(t.to).toBe(NOW);
    expect(t.trackingSince).toBe(D(10, 15));
    expect(t.readings).toHaveLength(4);
  });

  it("joins readings only across at most one game, and leaves a gap where several were unseen", () => {
    const t = rankTimeline(readings, [], "year", NOW);
    expect(t.links.map((l) => l.kind)).toEqual(["step", "gap", "step"]);
    expect(t.links[1]!.games).toBe(4);
  });

  it("marks promotions and demotions, exact only when a single game lies between", () => {
    const t = rankTimeline(readings, [], "year", NOW);
    expect(t.markers.map((m) => [m.kind, m.to, m.exact])).toEqual([
      ["promotion", "Gold I", false],
      ["demotion", "Gold II", true],
    ]);
    expect(t.markers[0]!.since).toBe(D(10, 16));
  });

  it("names the highest recorded rank in view and pads the scale to whole divisions", () => {
    const t = rankTimeline(readings, [], "year", NOW);
    expect(t.peak).toEqual({ at: D(10, 18), score: 3 * 400 + 3 * 100 + 12, label: "Gold I", lp: 12 });
    expect(t.scoreRange).toEqual([1400, 1600]);
  });

  it("breaks the line at a reset and at unranked readings", () => {
    const t = rankTimeline([snap(D(10, 15), "GOLD", "II", 46, 100, 90), snap(D(10, 16), null, null, null, null, null), snap(D(10, 20), "SILVER", "I", 10, 3, 2)], [], "year", NOW);
    expect(t.links.map((l) => l.kind)).toEqual(["reset", "reset"]);
    expect(t.markers.map((m) => m.kind)).toEqual(["reset", "placed"]);
  });

  it("shows a season on its own, with the reading before it running in, and the weeks of games inside it", () => {
    const weeks = [
      { week: Date.UTC(2026, 3, 27), wins: 3, losses: 1 },
      { week: Date.UTC(2026, 6, 27), wins: 5, losses: 4 },
      { week: Date.UTC(2026, 9, 12), wins: 2, losses: 2 },
    ];
    const s2 = rankTimeline(readings, weeks, "s2", NOW);
    expect([s2.from, s2.to]).toEqual([Date.UTC(2026, 3, 29), Date.UTC(2026, 6, 29)]);
    expect(s2.readings).toHaveLength(0); // nothing was recorded in Season 2
    expect(s2.peak).toBeNull();
    expect(s2.weeks.map((w) => w.week)).toEqual([Date.UTC(2026, 3, 27), Date.UTC(2026, 6, 27)]);
    expect(s2.games).toEqual({ wins: 8, losses: 5 });
    const s3 = rankTimeline(readings, weeks, "s3", NOW);
    expect(s3.readings).toHaveLength(4);
    expect(s3.games).toEqual({ wins: 7, losses: 6 });
  });
});

describe("timelineReadings", () => {
  it("joins identical consecutive rows into one reading seen from the first to the last", () => {
    const r = timelineReadings([snap(D(10, 15), "GOLD", "II", 46, 100, 90), snap(D(10, 15, 13), "GOLD", "II", 46, 100, 90, D(10, 15, 19))]);
    expect(r).toHaveLength(1);
    expect([r[0]!.from, r[0]!.to]).toEqual([D(10, 15), D(10, 15, 19)]);
  });
});

describe("ladderGrid", () => {
  it("labels every division over a small range and only tiers over a large one", () => {
    expect(ladderGrid([1300, 1500]).map((g) => g.label)).toEqual(["Gold III", "Gold II", "Gold I"]);
    expect(ladderGrid([800, 2900]).map((g) => g.label)).toEqual(["Silver", "Gold", "Platinum", "Emerald", "Diamond", "Master"]);
  });
});
