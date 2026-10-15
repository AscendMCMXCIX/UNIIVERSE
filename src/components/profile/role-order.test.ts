import { describe, expect, it } from "vitest";
import { moveRolePatch, roleOrder, type ProfileState } from "./use-profile-autosave";

const state: ProfileState = {
  primaryRole: "TOP",
  primaryPool: ["Gwen", "Jax"],
  secondaryRole: "JUNGLE",
  secondaryPool: ["Viego"],
  additionalRoles: [
    { role: "SUPPORT", pool: ["Thresh", "Nautilus"] },
    { role: "MID", pool: ["Ahri"] },
  ],
};
const apply = (s: ProfileState, from: number, to: number): ProfileState => ({ ...s, ...moveRolePatch(s, from, to)! }) as ProfileState;
const order = (s: ProfileState) => roleOrder(s).map((r) => r.role);

describe("moving whole role sections", () => {
  it("promotes an Off Role dragged to the top; the old Primary Role becomes the first Off Role", () => {
    const s = apply(state, 2, 0);
    expect(order(s)).toEqual(["SUPPORT", "TOP", "JUNGLE", "MID"]);
    expect(s.primaryRole).toBe("SUPPORT");
    expect(s.primaryPool).toEqual(["Thresh", "Nautilus"]);
    expect(s.secondaryRole).toBe("TOP");
    expect(s.secondaryPool).toEqual(["Gwen", "Jax"]);
    expect(s.additionalRoles).toEqual([{ role: "JUNGLE", pool: ["Viego"] }, { role: "MID", pool: ["Ahri"] }]);
  });

  it("reorders Off Roles among themselves (Mid above Jungle)", () => {
    expect(order(apply(state, 3, 1))).toEqual(["TOP", "MID", "JUNGLE", "SUPPORT"]);
  });

  it("moves the Primary Role down: the role now first becomes Primary", () => {
    const s = apply(state, 0, 2);
    expect(order(s)).toEqual(["JUNGLE", "SUPPORT", "TOP", "MID"]);
    expect(s.primaryPool).toEqual(["Viego"]);
  });

  it("never loses or duplicates a role or a champion, and keeps champion order, over repeated moves", () => {
    let s = state;
    for (const [f, t] of [[2, 0], [0, 3], [1, 2], [3, 0], [2, 1]] as const) s = apply(s, f, t);
    const all = roleOrder(s);
    expect(all.map((r) => r.role).sort()).toEqual(["JUNGLE", "MID", "SUPPORT", "TOP"]);
    expect(new Set(all.map((r) => r.role)).size).toBe(4);
    expect(all.find((r) => r.role === "SUPPORT")!.pool).toEqual(["Thresh", "Nautilus"]);
    expect(all.find((r) => r.role === "TOP")!.pool).toEqual(["Gwen", "Jax"]);
  });

  it("does nothing for a move to the same place or out of range", () => {
    expect(moveRolePatch(state, 1, 1)).toBeNull();
    expect(moveRolePatch(state, 0, 9)).toBeNull();
  });

  it("works with a single Off Role and with none", () => {
    const two: ProfileState = { ...state, additionalRoles: [] };
    expect(order(apply(two, 1, 0))).toEqual(["JUNGLE", "TOP"]);
    expect(moveRolePatch({ ...two, secondaryRole: null, secondaryPool: [] }, 0, 0)).toBeNull();
  });
});
