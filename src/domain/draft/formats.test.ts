import { describe, expect, it } from "vitest";
import { buildSteps, customFormat, RANKED_FLEX_FORMAT, stepsFor, TOURNAMENT_FORMAT, validateFormat } from "./formats";
import { enemyActionsBeforeNextPick, stepLabel, TOURNAMENT_SEQUENCE } from "./sequence";
import { applyAction, deriveDraft, type DraftState } from "./state";
import { DEFAULT_ASSIGNMENT } from "../../../tests/fixtures/players";

describe("draft formats", () => {
  it("tournament format reproduces the standard 20-step sequence", () => {
    const steps = buildSteps(TOURNAMENT_FORMAT);
    expect(steps.map((s) => (s.side === "blue" ? "B" : "R")).join("")).toBe("BRBRBRBRRBBRRBRBRBBR");
    expect(steps).toEqual(TOURNAMENT_SEQUENCE.map((s) => ({ ...s })));
  });

  it("ranked flex uses simultaneous bans (ours first) and a 1-2-2-2-2-1 pick order", () => {
    const blue = stepsFor(RANKED_FLEX_FORMAT, "blue");
    expect(blue).toHaveLength(20);
    expect(blue.slice(0, 10).every((s) => s.type === "ban" && s.simultaneous)).toBe(true);
    expect(blue.slice(0, 5).every((s) => s.side === "blue")).toBe(true);
    expect(blue.slice(5, 10).every((s) => s.side === "red")).toBe(true);
    expect(blue.slice(10).map((s) => (s.side === "blue" ? "B" : "R")).join("")).toBe("BRRBBRRBBR");
    expect(blue.filter((s) => s.type === "pick").map(stepLabel)).toEqual(["B1", "R1", "R2", "B2", "B3", "R3", "R4", "B4", "B5", "R5"]);
    expect(blue.filter((s) => s.windowSize === 2)).toHaveLength(8);
    // Red side: our bans are listed first.
    const red = stepsFor(RANKED_FLEX_FORMAT, "red");
    expect(red.slice(0, 5).every((s) => s.side === "red")).toBe(true);
    expect(red.filter((s) => s.phase === "ban2")).toHaveLength(0);
  });

  it("counts no enemy bans between picks in ranked flex", () => {
    const steps = stepsFor(RANKED_FLEX_FORMAT, "blue");
    expect(enemyActionsBeforeNextPick(10, "blue", steps)).toEqual({ bans: 0, picks: 2, nextPickIndex: 13 });
    expect(enemyActionsBeforeNextPick(14, "blue", steps)).toEqual({ bans: 0, picks: 2, nextPickIndex: 17 });
  });

  it("drives a ranked flex draft to completion through the state machine", () => {
    let s: DraftState = { side: "red", formatId: "ranked-flex", actions: [], assignments: { ...DEFAULT_ASSIGNMENT } };
    const d0 = deriveDraft(s);
    expect(d0.format.id).toBe("ranked-flex");
    expect(d0.nextStep?.side).toBe("red");
    expect(d0.ourTurn).toBe(true);
    const names = "ABCDEFGHIJKLMNOPQRST".split("");
    let k = 0;
    while (!deriveDraft(s).isComplete) {
      const step = deriveDraft(s).nextStep!;
      const r = applyAction(s, { championId: names[k++]!, role: step.type === "pick" && step.side === "red" ? deriveDraft(s).openRoles[0] : null });
      if (!r.ok) throw new Error(r.error);
      s = r.state;
    }
    const d = deriveDraft(s);
    expect(d.ourBans).toHaveLength(5);
    expect(d.enemyBans).toHaveLength(5);
    expect(d.ourPicks).toHaveLength(5);
    expect(d.enemyPicks).toHaveLength(5);
  });

  it("builds and validates custom formats", () => {
    const f = customFormat({ id: "one-ban-phase", name: "One ban phase", ban1: "BRBRBR", pick1: "BRRBBRRBBR" });
    expect(stepsFor(f)).toHaveLength(16);
    expect(() => customFormat({ id: "bad", name: "Bad", pick1: "BRRB" })).toThrow(/exactly five/);
    expect(validateFormat({ id: "X Y", name: "", description: "", phases: [], hiddenBans: false }).length).toBeGreaterThan(1);
  });
});
