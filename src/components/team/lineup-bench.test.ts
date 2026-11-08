import { describe, expect, it, vi } from "vitest";
import type { RosterSlot } from "@/server/team/roster";
import { benchShape, createLineupTurns, lineupArtVars } from "./lineup-bench";

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

/** Slots for the art's sizing: per role, whether a starter shows figures (null: nobody starts) and whether a substitute does (null: none). */
const sized = (roles: Array<{ starter: boolean | null; sub: boolean | null }>) =>
  roles.map((r, i) => ({ role: ["TOP", "JUNGLE", "MID", "ADC", "SUPPORT"][i], player: r.starter === null ? null : { statsVisible: r.starter }, substitute: r.sub === null ? null : { player: { name: `Sub ${i}`, statsVisible: r.sub }, champions: [] } })) as unknown as RosterSlot[];

describe("lineupArtVars", () => {
  it("counts a card's figures when either side shows them: a substitute's alone makes the card as tall as one with figures", () => {
    // A viewer who may not see teammates' figures but sees their own, as a designated substitute.
    expect(lineupArtVars(sized([{ starter: false, sub: true }, { starter: false, sub: null }, { starter: false, sub: null }, { starter: false, sub: null }, { starter: false, sub: null }]), false)["--lineup-figures"]).toBe(1);
    expect(lineupArtVars(sized([{ starter: true, sub: null }, { starter: false, sub: null }, { starter: false, sub: null }, { starter: false, sub: null }, { starter: false, sub: null }]), false)["--lineup-figures"]).toBe(1);
    expect(lineupArtVars(sized([{ starter: false, sub: false }, { starter: false, sub: null }, { starter: false, sub: null }, { starter: false, sub: null }, { starter: false, sub: null }]), false)["--lineup-figures"]).toBe(0);
  });

  it("leaves out a substitute under an open role: with no starter there is no back to turn to", () => {
    expect(lineupArtVars(sized([{ starter: null, sub: true }, { starter: false, sub: null }, { starter: false, sub: null }, { starter: false, sub: null }, { starter: false, sub: null }]), false)["--lineup-figures"]).toBe(0);
  });

  it("keeps room for the bench as it is drawn: its row, a lineup manager's hint, or nothing", () => {
    const filled = { starter: true, sub: null };
    expect(lineupArtVars(sized([{ starter: true, sub: true }, filled, filled, filled, filled]), false)["--lineup-bench"]).toBe("5.25rem");
    expect(lineupArtVars(sized([filled, filled, filled, filled, filled]), true)["--lineup-bench"]).toBe("1.75rem");
    expect(lineupArtVars(sized([filled, filled, filled, filled, filled]), false)["--lineup-bench"]).toBe("0rem");
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
