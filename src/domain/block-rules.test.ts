import { describe, expect, it } from "vitest";
import { blockStatusText, correctionOutcome, lossLimitReached } from "./ranked-improvement";

describe("block completion rules", () => {
  it("the two-loss limit counts losses in total; a game target never completes by itself", () => {
    expect(lossLimitReached("two-losses", 1)).toBe(false);
    expect(lossLimitReached("two-losses", 2)).toBe(true);
    expect(lossLimitReached("target", 9)).toBe(false);
  });

  it("corrections complete, reopen (latest block only, nothing else running) or keep", () => {
    const base = { rule: "two-losses" as const, isLatest: true, otherActive: false };
    expect(correctionOutcome({ ...base, status: "active", reason: null, losses: 2 })).toBe("complete");
    expect(correctionOutcome({ ...base, status: "active", reason: null, losses: 1 })).toBe("keep");
    expect(correctionOutcome({ ...base, status: "completed", reason: "two-losses", losses: 1 })).toBe("reopen");
    expect(correctionOutcome({ ...base, status: "completed", reason: "two-losses", losses: 1, isLatest: false })).toBe("keep");
    expect(correctionOutcome({ ...base, status: "completed", reason: "two-losses", losses: 1, otherActive: true })).toBe("keep");
    expect(correctionOutcome({ ...base, status: "completed", reason: "manual", losses: 0 })).toBe("keep");
    expect(correctionOutcome({ ...base, rule: "target", status: "active", reason: null, losses: 5 })).toBe("keep");
  });

  it("labels say why a block ended, only while it is still true", () => {
    expect(blockStatusText({ state: "completed", completedReason: "two-losses", losses: 2 })).toBe("Completed · 2-loss limit reached");
    expect(blockStatusText({ state: "completed", completedReason: "two-losses", losses: 1 })).toBe("Completed");
    expect(blockStatusText({ state: "completed-early", completedReason: "manual", losses: 0 })).toBe("Completed early");
    expect(blockStatusText({ state: "active", completedReason: null, losses: 1 })).toBe("In progress");
  });
});
