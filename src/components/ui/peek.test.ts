import { describe, expect, it } from "vitest";
import { historyStep, itemHref, itemIn } from "./address-item";
import { peekKeyStep, stepId } from "./peek";
import { anchorCorrection } from "./unfold";
import { WINDOW_POSTURE_QUERY } from "./posture";

describe("the one history rule (address-item)", () => {
  it("pushes on the first open, replaces on a switch, goes Back on closing what it pushed", () => {
    expect(historyStep(null, "a", false)).toBe("push");
    expect(historyStep("a", "b", true)).toBe("replace");
    expect(historyStep("b", "c", true)).toBe("replace");
    expect(historyStep("c", null, true)).toBe("back");
  });
  it("replaces the address when closing an item it did not push (a deep link)", () => {
    expect(historyStep("a", null, false)).toBe("replace");
  });
  it("so after any number of switches one Back closes it: a session adds at most one entry", () => {
    let entries = 1;
    let open: string | null = null;
    let pushed = false;
    for (const to of ["a", "b", "c", "d"]) {
      const step = historyStep(open, to, pushed);
      if (step === "push") {
        entries++;
        pushed = true;
      }
      open = to;
    }
    expect(entries).toBe(2);
    expect(historyStep(open, null, pushed)).toBe("back");
  });
  it("writes the item into the current page's query, keeping the rest", () => {
    expect(itemHref("/team?view=lineup", "player", "p1")).toBe("/team?view=lineup&player=p1");
    expect(itemHref("/team?player=p1&view=lineup", "player", "p2")).toBe("/team?player=p2&view=lineup");
    expect(itemHref("/team?player=p1&view=lineup#top", "player", null)).toBe("/team?view=lineup#top");
    expect(itemHref("/team?player=p1", "player", null)).toBe("/team");
    expect(itemIn("?player=p1", "player")).toBe("p1");
    expect(itemIn("?player=", "player")).toBeNull();
  });
});

describe("Peek's selection", () => {
  const ids = ["top", "jungle", "mid"];
  it("moves one row at a time without wrapping", () => {
    expect(stepId(ids, "top", 1)).toBe("jungle");
    expect(stepId(ids, "mid", 1)).toBeNull();
    expect(stepId(ids, "top", -1)).toBeNull();
    expect(stepId(ids, "gone", 1)).toBeNull();
    expect(stepId(ids, null, 1)).toBeNull();
  });
  it("answers ↑/↓ and J/K only", () => {
    expect(peekKeyStep("ArrowDown")).toBe(1);
    expect(peekKeyStep("j")).toBe(1);
    expect(peekKeyStep("ArrowUp")).toBe(-1);
    expect(peekKeyStep("K")).toBe(-1);
    expect(peekKeyStep("ArrowLeft")).toBe(0);
    expect(peekKeyStep("Enter")).toBe(0);
  });
});

describe("Unfold's anchored switching", () => {
  it("scrolls by however far the pressed card moved, so it stays where it was", () => {
    // A 600px game above closes: the card pressed moves up 600px, and the page follows it up.
    expect(anchorCorrection(400, -200)).toBe(-600);
    expect(anchorCorrection(300, 300)).toBe(0);
  });
});

describe("posture", () => {
  it("gives touch phones, narrow windows and short windows a sheet, by pointer and posture", () => {
    expect(WINDOW_POSTURE_QUERY).toContain("(pointer: coarse) and (max-width: 47.99rem)");
    expect(WINDOW_POSTURE_QUERY).toContain("(max-height: 30rem)");
  });
});
