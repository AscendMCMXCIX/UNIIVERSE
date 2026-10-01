import { describe, expect, it } from "vitest";
import { defaultAssignment, describeSwap, enumerateLegalAssignments, validateAssignment } from "./assignments";
import { DEFAULT_ASSIGNMENT, LINEUP, PLAYER_A, PLAYER_B, PLAYER_C, PLAYER_D, PLAYER_E, PLAYER_SUB } from "../../../tests/fixtures/players";

describe("legal role assignments", () => {
  it("enumerates only assignments where each player is in a configured role", () => {
    const options = enumerateLegalAssignments(LINEUP);
    // Legal: default; A<->B swap (Top/Mid); D<->E swap (ADC/Support); both swaps.
    expect(options).toHaveLength(4);
    expect(options[0]!.assignment).toEqual(DEFAULT_ASSIGNMENT);
    expect(options[0]!.swapCount).toBe(0);
    const swapTopMid = options.find((o) => o.assignment.TOP === PLAYER_B.id && o.assignment.MID === PLAYER_A.id);
    expect(swapTopMid?.swapCount).toBe(2);
    // Player C (jungle only) is never moved.
    expect(options.every((o) => o.assignment.JUNGLE === PLAYER_C.id)).toBe(true);
  });

  it("respects locked roles", () => {
    const options = enumerateLegalAssignments(LINEUP, { TOP: PLAYER_A.id });
    expect(options).toHaveLength(2);
    expect(options.every((o) => o.assignment.TOP === PLAYER_A.id)).toBe(true);
  });

  it("rejects assignments outside primary/secondary roles", () => {
    const bad = validateAssignment(LINEUP, { ...DEFAULT_ASSIGNMENT, JUNGLE: PLAYER_A.id, TOP: PLAYER_C.id });
    expect(bad.ok).toBe(false);
    expect(bad.errors.join(" ")).toMatch(/cannot play/);
  });

  it("builds the default assignment from primary roles", () => {
    expect(defaultAssignment(LINEUP)).toEqual(DEFAULT_ASSIGNMENT);
    // Two top primaries collide → no default.
    expect(defaultAssignment([PLAYER_SUB, PLAYER_A, PLAYER_C, PLAYER_D, PLAYER_E])).toBeNull();
  });

  it("swapping an active player changes the legal options", () => {
    const withSub = [PLAYER_SUB, PLAYER_B, PLAYER_C, PLAYER_D, PLAYER_E];
    const options = enumerateLegalAssignments(withSub);
    // Sub Top only plays top, Player B must mid → only the ADC/Support swap remains optional.
    expect(options).toHaveLength(2);
    expect(options.every((o) => o.assignment.TOP === PLAYER_SUB.id && o.assignment.MID === PLAYER_B.id)).toBe(true);
  });

  it("describes a swap as player moves", () => {
    const to = { ...DEFAULT_ASSIGNMENT, TOP: PLAYER_B.id, MID: PLAYER_A.id };
    expect(describeSwap(LINEUP, DEFAULT_ASSIGNMENT, to)).toEqual([
      { playerId: PLAYER_B.id, displayName: "Player B", from: "MID", to: "TOP" },
      { playerId: PLAYER_A.id, displayName: "Player A", from: "TOP", to: "MID" },
    ]);
  });
});
