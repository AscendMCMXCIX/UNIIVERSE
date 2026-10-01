import { describe, expect, it } from "vitest";
import { TOURNAMENT_SEQUENCE, enemyActionsBeforeNextPick, stepLabel } from "./sequence";

describe("tournament draft sequence", () => {
  it("has 20 steps: 10 bans and 10 picks, five per side", () => {
    expect(TOURNAMENT_SEQUENCE).toHaveLength(20);
    const bans = TOURNAMENT_SEQUENCE.filter((s) => s.type === "ban");
    const picks = TOURNAMENT_SEQUENCE.filter((s) => s.type === "pick");
    expect(bans).toHaveLength(10);
    expect(picks).toHaveLength(10);
    expect(bans.filter((s) => s.side === "blue")).toHaveLength(5);
    expect(picks.filter((s) => s.side === "red")).toHaveLength(5);
  });

  it("follows the standard order B R B R B R | B RR BB R | R B R B | R BB R", () => {
    const sides = TOURNAMENT_SEQUENCE.map((s) => (s.side === "blue" ? "B" : "R")).join("");
    expect(sides).toBe("BRBRBR" + "BRRBBR" + "RBRB" + "RBBR");
    const phases = TOURNAMENT_SEQUENCE.map((s) => s.phase);
    expect(phases.slice(0, 6).every((p) => p === "ban1")).toBe(true);
    expect(phases.slice(6, 12).every((p) => p === "pick1")).toBe(true);
    expect(phases.slice(12, 16).every((p) => p === "ban2")).toBe(true);
    expect(phases.slice(16).every((p) => p === "pick2")).toBe(true);
  });

  it("labels picks B1..B5 and R1..R5 in order", () => {
    const labels = TOURNAMENT_SEQUENCE.filter((s) => s.type === "pick").map(stepLabel);
    expect(labels).toEqual(["B1", "R1", "R2", "B2", "B3", "R3", "R4", "B4", "B5", "R5"]);
  });

  it("marks consecutive pick windows (R1/R2, B2/B3, B4/B5) as pairs", () => {
    const windows = TOURNAMENT_SEQUENCE.filter((s) => s.windowSize === 2).map((s) => `${stepLabel(s)}@${s.windowPosition}`);
    expect(windows).toEqual(["R1@0", "R2@1", "B2@0", "B3@1", "B4@0", "B5@1"]);
    expect(TOURNAMENT_SEQUENCE.filter((s) => s.type === "ban").every((s) => s.windowSize === 1)).toBe(true);
  });

  it("counts enemy actions before our next pick", () => {
    // Blue has just made B1 (index 6). Red picks twice before B2.
    expect(enemyActionsBeforeNextPick(6, "blue")).toEqual({ bans: 0, picks: 2, nextPickIndex: 9 });
    // After B3 (index 10) blue's next pick is B4 (17): red picks R3, bans twice, picks R4 in between.
    expect(enemyActionsBeforeNextPick(10, "blue")).toEqual({ bans: 2, picks: 2, nextPickIndex: 17 });
    // After R5 nothing remains.
    expect(enemyActionsBeforeNextPick(19, "red").nextPickIndex).toBeNull();
  });
});
