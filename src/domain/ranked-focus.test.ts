import { describe, expect, it } from "vitest";
import { FOCUS_NONE, followsPool, resolveFocusChampions } from "./ranked-focus";

const none = { champion1: null, champion2: null, champion3: null, counterPick: null };

describe("Solo Queue Blocks focus champions", () => {
  it("follow the Primary Role pool in its order, and a changed pool at once", () => {
    const r = resolveFocusChampions(none, ["Ahri", "Syndra", "Orianna", "Viktor"]);
    expect([r.champion1, r.champion2, r.champion3]).toEqual([
      { id: "Ahri", source: "pool", poolIndex: 1 },
      { id: "Syndra", source: "pool", poolIndex: 2 },
      { id: "Orianna", source: "pool", poolIndex: 3 },
    ]);
    // Reordered pool: the focus follows (nothing was saved from the old order).
    expect(resolveFocusChampions(none, ["Viktor", "Ahri"]).champion1).toEqual({ id: "Viktor", source: "pool", poolIndex: 1 });
    expect(followsPool(none)).toBe(true);
  });

  it("keeps the player's own choices and skips them in the pool, including the counter pick", () => {
    const r = resolveFocusChampions({ ...none, champion1: "Syndra", counterPick: "Ahri" }, ["Ahri", "Syndra", "Orianna", "Viktor"]);
    expect(r.champion1).toEqual({ id: "Syndra", source: "chosen" });
    expect(r.champion2).toEqual({ id: "Orianna", source: "pool", poolIndex: 3 });
    expect(r.champion3).toEqual({ id: "Viktor", source: "pool", poolIndex: 4 });
    expect(followsPool({ ...none, champion1: "Syndra" })).toBe(false);
  });

  it("leaves a slot cleared on purpose empty, and an empty pool shows nothing", () => {
    const r = resolveFocusChampions({ ...none, champion2: FOCUS_NONE }, ["Ahri", "Syndra"]);
    expect(r.champion2).toEqual({ id: null, source: "none" });
    expect(r.champion3).toEqual({ id: "Syndra", source: "pool", poolIndex: 2 });
    expect(resolveFocusChampions(none, []).champion1).toEqual({ id: null, source: "none" });
  });
});
