import { describe, expect, it } from "vitest";
import { ladderScore, rankLabel, rankProgress, snapshotChanged, type RankSnapshot } from "./rank-progress";

const DAY = 86_400_000;
const T0 = Date.UTC(2026, 8, 1);
const snap = (day: number, tier: string | null, division: string | null, lp: number | null, wins = 10, losses = 10, queue: "solo" | "flex" = "solo"): RankSnapshot => ({ queue, tier, division, leaguePoints: lp, wins, losses, capturedAt: T0 + day * DAY });

describe("ladderScore", () => {
  it("puts a higher division above more LP in a lower one", () => {
    expect(ladderScore(snap(0, "GOLD", "II", 10))!).toBeGreaterThan(ladderScore(snap(0, "GOLD", "III", 90))!);
    expect(ladderScore(snap(0, "PLATINUM", "IV", 0))!).toBeGreaterThan(ladderScore(snap(0, "GOLD", "I", 99))!);
  });
  it("continues above Diamond I for Master and higher, by LP", () => {
    expect(ladderScore(snap(0, "MASTER", null, 50))!).toBeGreaterThan(ladderScore(snap(0, "DIAMOND", "I", 99))!);
    expect(ladderScore(snap(0, "GRANDMASTER", null, 300))!).toBeGreaterThan(ladderScore(snap(0, "MASTER", null, 200))!);
  });
  it("is null when unranked", () => {
    expect(ladderScore(snap(0, null, null, null))).toBeNull();
  });
});

describe("rankLabel", () => {
  it("names divisions and apex tiers", () => {
    expect(rankLabel("GOLD", "II")).toBe("Gold II");
    expect(rankLabel("MASTER", "I")).toBe("Master");
    expect(rankLabel(null, null)).toBe("Unranked");
  });
});

describe("snapshotChanged", () => {
  it("records the first reading even when nothing moved, then only changes", () => {
    const s = snap(0, "GOLD", "II", 40);
    expect(snapshotChanged(null, s)).toBe(true);
    expect(snapshotChanged(s, { ...s })).toBe(false);
    expect(snapshotChanged(s, { ...s, leaguePoints: 58, wins: 11 })).toBe(true);
  });
});

describe("rankProgress", () => {
  it("shows a promotion as a step up, not an LP collapse", () => {
    const p = rankProgress("solo", [snap(0, "GOLD", "III", 85), snap(1, "GOLD", "II", 3, 11)], T0 + 2 * DAY);
    expect(p.points[1]!.score).toBeGreaterThan(p.points[0]!.score);
    expect(p.events[0]).toMatchObject({ kind: "promotion", from: "Gold III", to: "Gold II" });
    expect(p.change!.points).toBe(18);
  });

  it("shows a demotion and a tier change by name", () => {
    const p = rankProgress("solo", [snap(0, "PLATINUM", "IV", 0), snap(1, "GOLD", "I", 75, 10, 11)], T0 + 2 * DAY);
    expect(p.events[0]).toMatchObject({ kind: "tier-down", from: "Platinum IV", to: "Gold I" });
    expect(p.change!.points).toBe(-25);
  });

  it("starts a new segment at a season reset and never measures change across it", () => {
    const p = rankProgress("solo", [snap(0, "DIAMOND", "II", 50, 100, 90), snap(10, null, null, null, 0, 0), snap(12, "EMERALD", "I", 20, 3, 2)], T0 + 13 * DAY);
    expect(p.segments).toBe(2);
    expect(p.events.map((e) => e.kind)).toEqual(["placed", "reset"]);
    expect(p.points.map((x) => x.segment)).toEqual([0, 1]);
    expect(p.change).toBeNull(); // one point in the current season
  });

  it("treats fewer games than before as a new season even without an unranked reading", () => {
    const p = rankProgress("solo", [snap(0, "GOLD", "I", 50, 100, 90), snap(5, "GOLD", "IV", 0, 5, 5)], T0 + 6 * DAY);
    expect(p.events[0]!.kind).toBe("reset");
    expect(p.segments).toBe(2);
  });

  it("keeps Solo/Duo and Flex apart and reports the real tracking start", () => {
    const list = [snap(3, "GOLD", "II", 40), snap(1, "SILVER", "I", 10, 5, 5, "flex")];
    expect(rankProgress("solo", list, T0 + 4 * DAY).trackingSince).toBe(T0 + 3 * DAY);
    expect(rankProgress("flex", list, T0 + 4 * DAY).points).toHaveLength(1);
    expect(rankProgress("solo", [], T0).current).toBeNull();
  });

  it("measures the window from the last point before it", () => {
    const p = rankProgress("solo", [snap(0, "GOLD", "IV", 0), snap(20, "GOLD", "III", 0, 15), snap(40, "GOLD", "II", 0, 20)], T0 + 41 * DAY, 30);
    expect(p.change).toMatchObject({ points: 200, from: "Gold IV 0 LP", to: "Gold II 0 LP" });
  });
});
