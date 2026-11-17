import { describe, expect, it, vi } from "vitest";
import type { RosterSlot } from "@/server/team/roster";
import { benchShape, createLineupTurns } from "./lineup-bench";

/** Slots that only carry what the bench reads: whether each role has a substitute. */
const slots = (withSubstitute: boolean[]) => withSubstitute.map((has, i) => ({ role: ["TOP", "JUNGLE", "MID", "ADC", "SUPPORT"][i], substitute: has ? { player: { name: `Sub ${i}` }, champions: [] } : null })) as unknown as RosterSlot[];

describe("benchShape", () => {
  it("is a row whenever a role has a substitute, for everyone", () => {
    expect(benchShape(slots([true, false, false, false, false]), false)).toBe("row");
    expect(benchShape(slots([false, false, false, false, true]), true)).toBe("row");
  });

  it("without any substitute: a hint for lineup managers, nothing for anyone else", () => {
    expect(benchShape(slots([false, false, false, false, false]), true)).toBe("hint");
    expect(benchShape(slots([false, false, false, false, false]), false)).toBe("none");
  });
});

describe("createLineupTurns", () => {
  it("turns a card through the turn it registered, and nothing once it has gone", () => {
    const turns = createLineupTurns();
    const turn = vi.fn();
    turns.register("TOP", turn);
    turns.turn("TOP", true, true);
    expect(turn).toHaveBeenCalledWith(true, true);
    turns.turn("MID", true, false);
    expect(turn).toHaveBeenCalledTimes(1);
    turns.register("TOP", null);
    turns.turn("TOP", false, false);
    expect(turn).toHaveBeenCalledTimes(1);
  });

  it("knows which cards show their substitute, and tells listeners only when that changes", () => {
    const turns = createLineupTurns();
    const listener = vi.fn();
    const off = turns.subscribe(listener);
    expect(turns.shown("SUPPORT")).toBe(false);
    turns.report("SUPPORT", true);
    expect(turns.shown("SUPPORT")).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);
    // The same side again changes nothing.
    turns.report("SUPPORT", true);
    expect(listener).toHaveBeenCalledTimes(1);
    turns.report("SUPPORT", false);
    expect(turns.shown("SUPPORT")).toBe(false);
    expect(listener).toHaveBeenCalledTimes(2);
    off();
    turns.report("SUPPORT", true);
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
