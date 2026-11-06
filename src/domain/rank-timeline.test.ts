import { describe, expect, it } from "vitest";
import { ladderGrid, MIN_DRAWN_SPAN, rankedYearCoverage, rankMovement, rankTimeline, timelineReadings } from "./rank-timeline";
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

  it("spans only what was read: the first reading to now, never the months before it", () => {
    const t = rankTimeline(readings, NOW);
    expect(t.from).toBe(D(10, 15));
    expect(t.to).toBe(NOW);
    expect(t.trackingSince).toBe(D(10, 15));
    expect(t.readings).toHaveLength(4);
  });

  it("draws at least three days, so a new account's first reading is a line, the days before it unrecorded", () => {
    const t = rankTimeline([snap(NOW - 3_600_000, "GOLD", "II", 46, 100, 90)], NOW);
    expect(t.to - t.from).toBe(MIN_DRAWN_SPAN);
    expect(t.trackingSince).toBe(NOW - 3_600_000);
    expect(t.peak?.label).toBe("Gold II");
  });

  it("never starts before the ranked year, whatever the readings", () => {
    const t = rankTimeline([snap(Date.UTC(2025, 11, 20), "GOLD", "II", 46, 100, 90), snap(Date.UTC(2026, 0, 9), "SILVER", "I", 0, 1, 0)], Date.UTC(2026, 0, 10));
    expect(t.from).toBe(Date.UTC(2026, 0, 8));
    // The 2025 reading was last seen before the year opened: it is not part of it.
    expect(t.readings.map((r) => r.label)).toEqual(["Silver I"]);
  });

  it("has no line, peak or scale without a reading", () => {
    const t = rankTimeline([], NOW);
    expect([t.trackingSince, t.peak, t.latest, t.scoreRange]).toEqual([null, null, null, null]);
    expect(t.to).toBe(NOW);
  });

  it("joins readings only across at most one game, and leaves a gap where several were unseen", () => {
    const t = rankTimeline(readings, NOW);
    expect(t.links.map((l) => l.kind)).toEqual(["step", "gap", "step"]);
    expect(t.links[1]!.games).toBe(4);
  });

  it("marks promotions and demotions, exact only when a single game lies between", () => {
    const t = rankTimeline(readings, NOW);
    expect(t.markers.map((m) => [m.kind, m.to, m.exact])).toEqual([
      ["promotion", "Gold I", false],
      ["demotion", "Gold II", true],
    ]);
    expect(t.markers[0]!.since).toBe(D(10, 16));
  });

  it("dates the highest recorded rank by the first time it was read", () => {
    const t = rankTimeline([snap(D(10, 18), "GOLD", "II", 75, 10, 10), snap(D(10, 22), "GOLD", "II", 50, 10, 11), snap(D(10, 28), "GOLD", "II", 75, 11, 11)], NOW);
    expect(t.peak?.at).toBe(D(10, 18));
  });

  it("never pads the scale below Iron IV 0 LP", () => {
    const t = rankTimeline([snap(D(10, 18), "IRON", "IV", 5, 10, 10)], NOW);
    expect(t.scoreRange![0]).toBe(0);
    expect(ladderGrid(t.scoreRange!).map((g) => g.label)).not.toContain("Unranked");
  });

  it("names the highest recorded rank and pads the scale to whole divisions", () => {
    const t = rankTimeline(readings, NOW);
    expect(t.peak).toEqual({ at: D(10, 18), score: 3 * 400 + 3 * 100 + 12, label: "Gold I", lp: 12 });
    expect(t.scoreRange).toEqual([1400, 1600]);
  });

  it("breaks the line at a reset and at unranked readings", () => {
    const t = rankTimeline([snap(D(10, 15), "GOLD", "II", 46, 100, 90), snap(D(10, 16), null, null, null, null, null), snap(D(10, 20), "SILVER", "I", 10, 3, 2)], NOW);
    expect(t.links.map((l) => l.kind)).toEqual(["reset", "reset"]);
    expect(t.markers.map((m) => m.kind)).toEqual(["reset", "placed"]);
  });
});

describe("rankMovement", () => {
  // NOW is 4 Nov, so the window opens on 5 Oct.
  it("compares the reading in effect when the window began (confirmed inside it) with the latest", () => {
    const t = rankTimeline([snap(D(9, 1), "GOLD", "II", 0, 40, 40), snap(D(9, 20), "GOLD", "II", 10, 50, 50, D(10, 6)), snap(D(10, 10), "GOLD", "II", 40, 60, 55), snap(D(11, 1), "GOLD", "II", 64, 70, 58)], NOW);
    const m = rankMovement(t, NOW)!;
    expect([m.windowed, m.kind, m.amount, m.from.from]).toEqual([true, "lp", 54, D(9, 20)]);
  });

  it("takes a reading followed within one game as still in effect at the window's start", () => {
    const t = rankTimeline([snap(D(9, 20), "GOLD", "II", 10, 50, 50), snap(D(10, 10), "GOLD", "II", 30, 51, 50), snap(D(11, 1), "GOLD", "II", 64, 55, 52)], NOW);
    expect(rankMovement(t, NOW)).toMatchObject({ windowed: true, amount: 54 });
  });

  it("never credits the window with unseen games that straddle its start: it starts inside, and says so", () => {
    // 20 Sep last seen on 20 Sep, then fifteen games unseen to 10 Oct: the rank on 5 Oct is unknown.
    const t = rankTimeline([snap(D(9, 20), "GOLD", "II", 10, 50, 50), snap(D(10, 10), "GOLD", "II", 40, 60, 55), snap(D(11, 1), "GOLD", "II", 64, 70, 58)], NOW);
    const m = rankMovement(t, NOW)!;
    expect([m.windowed, m.amount, m.from.from]).toEqual([false, 24, D(10, 10)]);
  });

  it("starts at the first reading when recording began inside the window, and says so", () => {
    const t = rankTimeline([snap(D(10, 15), "GOLD", "II", 14, 100, 90), snap(D(11, 1), "PLATINUM", "IV", 2, 130, 105)], NOW);
    const m = rankMovement(t, NOW)!;
    expect([m.windowed, m.kind, m.amount]).toEqual([false, "divisions", 2]);
    expect(m.from.from).toBe(D(10, 15));
  });

  it("says no change when the rank read before the window still holds, confirmed inside it", () => {
    const t = rankTimeline([snap(D(9, 1), "GOLD", "I", 70, 40, 40), snap(D(10, 1), "GOLD", "II", 40, 50, 50, D(11, 3))], NOW);
    const m = rankMovement(t, NOW)!;
    expect([m.windowed, m.kind, m.amount]).toEqual([true, "lp", 0]);
    expect(m.from).toBe(m.to);
  });

  it("claims nothing when no reading was confirmed inside the window", () => {
    expect(rankMovement(rankTimeline([snap(D(9, 1), "GOLD", "II", 40, 50, 50, D(9, 2))], NOW), NOW)).toBeNull();
  });

  it("counts divisions lost as negative, with no LP figure across them", () => {
    const t = rankTimeline([snap(D(10, 15), "GOLD", "IV", 10, 100, 90), snap(D(11, 1), "SILVER", "I", 75, 100, 92)], NOW);
    expect(rankMovement(t, NOW)).toMatchObject({ kind: "divisions", amount: -1 });
  });

  it("gives LP on the apex ladder, and only names the ranks across the Master line", () => {
    const apex = rankTimeline([snap(D(10, 15), "MASTER", null, 40, 200, 150), snap(D(11, 1), "GRANDMASTER", null, 420, 240, 160)], NOW);
    expect(rankMovement(apex, NOW)).toMatchObject({ kind: "lp", amount: 380 });
    const across = rankTimeline([snap(D(10, 15), "DIAMOND", "I", 90, 200, 150), snap(D(11, 1), "MASTER", null, 12, 203, 150)], NOW);
    expect(rankMovement(across, NOW)).toMatchObject({ kind: "tiers", amount: 0 });
  });

  it("never reaches across a reset, and has nothing to say with one new reading or an unranked latest", () => {
    const reset = rankTimeline([snap(D(10, 15), "GOLD", "II", 46, 100, 90), snap(D(10, 20), "SILVER", "I", 10, 3, 2), snap(D(11, 1), "SILVER", "I", 40, 5, 2)], NOW);
    expect(rankMovement(reset, NOW)).toMatchObject({ kind: "lp", amount: 30 });
    expect(rankMovement(rankTimeline([snap(D(10, 15), "GOLD", "II", 46, 100, 90)], NOW), NOW)).toBeNull();
    expect(rankMovement(rankTimeline([snap(D(10, 15), "GOLD", "II", 46, 100, 90), snap(D(10, 20), null, null, null, null, null)], NOW), NOW)).toBeNull();
  });
});

describe("rankedYearCoverage", () => {
  const weeks = [
    { week: Date.UTC(2026, 0, 5), wins: 1, losses: 0 },
    { week: Date.UTC(2026, 3, 27), wins: 3, losses: 1 },
    { week: Date.UTC(2026, 9, 12), wins: 2, losses: 2 },
  ];
  const readings = [
    snap(D(10, 15), "GOLD", "II", 46, 100, 90, D(10, 15, 20)),
    snap(D(10, 16), "GOLD", "II", 70, 101, 90),
    snap(D(10, 18), "GOLD", "I", 12, 104, 91, D(10, 18, 18)),
    snap(D(10, 20), "GOLD", "II", 75, 104, 92),
  ];

  it("covers the ranked year to now, with Riot's three seasons, in the installation's calendar days", () => {
    const c = rankedYearCoverage(rankTimeline(readings, NOW), weeks, NOW);
    expect(c.from).toBe(Date.UTC(2026, 0, 8));
    expect(c.seasons.map((s) => s.label)).toEqual(["Season 1", "Season 2", "Season 3"]);
    expect(c.season?.label).toBe("Season 3");
    expect(c.trackedFrom).toBe(D(10, 15));
    // 8 Jan to 4 Nov in Sydney: 301 days.
    expect(c.yearDays).toBe(301);
    expect(c.games).toEqual({ wins: 6, losses: 3 });
  });

  it("counts only the days the rank is known: readings, and single games between them, not the unseen gap", () => {
    // Sydney days: 15–16 Oct (a reading, then one game to the next), the gap of several games to
    // 18 Oct unknown, then 18–20 Oct. 17 Oct is not known.
    const c = rankedYearCoverage(rankTimeline(readings, NOW), weeks, NOW);
    expect(c.knownDays).toBe(5);
  });

  it("offers only the seasons begun, and no known days without a reading", () => {
    const c = rankedYearCoverage(rankTimeline([], Date.UTC(2026, 4, 1)), weeks, Date.UTC(2026, 4, 1));
    expect(c.seasons.map((s) => s.label)).toEqual(["Season 1", "Season 2"]);
    expect([c.trackedFrom, c.knownDays]).toEqual([null, 0]);
    expect(c.weeks).toHaveLength(2);
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

  it("names tiers alone sooner when asked, and shortens long names for a narrow chart", () => {
    expect(ladderGrid([1500, 2100], { maxDivisions: 4 }).map((g) => g.label)).toEqual(["Platinum", "Emerald"]);
    expect(ladderGrid([1800, 2000], { short: true }).map((g) => g.label)).toEqual(["Plat II", "Plat I", "Emer IV"]);
  });
});
