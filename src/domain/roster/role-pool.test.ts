import { describe, expect, it } from "vitest";
import { offRoles, playsRole, poolForRole } from "./role-pool";
import type { RosterPlayer } from "./types";

const top: RosterPlayer = { id: "t", displayName: "Demo Top", group: "main", primaryRole: "TOP", secondaryRole: "MID", primaryPool: ["Gwen", "KSante", "Jax"], secondaryPool: ["Galio", "Sylas"], additionalRoles: [{ role: "SUPPORT", pool: ["Braum"] }] };
const newcomer: RosterPlayer = { id: "n", displayName: "Demo Newcomer", group: "main", primaryRole: null, secondaryRole: null, primaryPool: [], secondaryPool: [] };

describe("playsRole", () => {
  it("matches the main role, the secondary role and every further role", () => {
    expect(["TOP", "MID", "SUPPORT"].map((r) => playsRole(top, r as never))).toEqual([true, true, true]);
    expect(playsRole(top, "JUNGLE")).toBe(false);
    expect(playsRole(top, "ADC")).toBe(false);
  });

  it("matches nothing for a member who has chosen no role", () => {
    expect(playsRole(newcomer, "TOP")).toBe(false);
  });
});

describe("offRoles", () => {
  it("lists the roles after the main one, in order, without repeats or the main role", () => {
    expect(offRoles(top)).toEqual(["MID", "SUPPORT"]);
    expect(offRoles({ ...top, primaryRole: "MID", secondaryRole: "MID", additionalRoles: [{ role: "TOP", pool: [] }, { role: "TOP", pool: [] }] })).toEqual(["TOP"]);
    expect(offRoles(newcomer)).toEqual([]);
  });
});

describe("before a main role is chosen", () => {
  it("plays no role and shows no pool, whatever else is stored (the lineup's rule)", () => {
    const partial: RosterPlayer = { ...newcomer, secondaryRole: "MID", secondaryPool: ["Galio"] };
    expect(playsRole(partial, "MID")).toBe(false);
    expect(offRoles(partial)).toEqual([]);
    expect(poolForRole(partial, "MID")).toEqual({ role: null, pool: [], slot: "primary" });
  });
});

describe("poolForRole", () => {
  it("is the main role's pool without a role, and for the main role", () => {
    expect(poolForRole(top, null)).toEqual({ role: "TOP", pool: ["Gwen", "KSante", "Jax"], slot: "primary" });
    expect(poolForRole(top, "TOP")).toEqual({ role: "TOP", pool: ["Gwen", "KSante", "Jax"], slot: "primary" });
  });

  it("is that role's own pool for an off role, secondary or further", () => {
    expect(poolForRole(top, "MID")).toEqual({ role: "MID", pool: ["Galio", "Sylas"], slot: "secondary" });
    expect(poolForRole(top, "SUPPORT")).toEqual({ role: "SUPPORT", pool: ["Braum"], slot: "additional" });
  });

  it("falls back to the main role's pool for a role the member does not play", () => {
    expect(poolForRole(top, "JUNGLE")).toEqual({ role: "TOP", pool: ["Gwen", "KSante", "Jax"], slot: "primary" });
    expect(poolForRole(newcomer, "MID")).toEqual({ role: null, pool: [], slot: "primary" });
  });
});
