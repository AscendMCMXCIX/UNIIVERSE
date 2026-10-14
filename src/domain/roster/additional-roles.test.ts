import { describe, expect, it } from "vitest";
import { enumerateLegalAssignments } from "./assignments";
import { eligibleChampions, flexOwners, legalRolesFor, poolFor, poolSlotFor, roleDistance, roleFit, roleRank } from "./eligibility";
import type { PlayerProfile } from "./types";
import { LINEUP, PLAYER_A, PLAYER_C } from "../../../tests/fixtures/players";

const FILL: PlayerProfile = {
  ...PLAYER_A,
  additionalRoles: [
    { role: "SUPPORT", pool: ["Rakan", "Nautilus"] },
    { role: "JUNGLE", pool: ["Vi"] },
  ],
};

describe("additional roles", () => {
  it("lists roles in preference order: primary, secondary, then additional", () => {
    expect(legalRolesFor(FILL)).toEqual(["TOP", "MID", "SUPPORT", "JUNGLE"]);
    expect(roleRank(FILL, "SUPPORT")).toBe(2);
    expect(roleRank(FILL, "ADC")).toBe(-1);
    expect(roleFit(FILL, "JUNGLE")).toBe("additional");
    expect(roleFit(FILL, "ADC")).toBe("other");
  });

  it("uses each additional role's own pool and nothing else", () => {
    expect(poolSlotFor(FILL, "SUPPORT")).toBe("additional");
    expect(poolFor(FILL, "SUPPORT")).toEqual(["Rakan", "Nautilus"]);
    expect(poolFor(FILL, "JUNGLE")).toEqual(["Vi"]);
    // The primary pool never leaks into an additional role.
    expect(poolFor(FILL, "SUPPORT")).not.toContain("Riven");
    expect(eligibleChampions(FILL, "SUPPORT", { unavailableChampionIds: new Set(["Rakan"]) })).toEqual(["Nautilus"]);
  });

  it("costs more the further a role is from the player's preference", () => {
    expect(roleDistance(FILL, "TOP")).toBe(0);
    expect(roleDistance(FILL, "MID")).toBe(1);
    expect(roleDistance(FILL, "SUPPORT")).toBe(2);
    expect(roleDistance(FILL, "JUNGLE")).toBe(2.5);
  });

  it("counts an additional-role champion as a genuine flex option", () => {
    expect(flexOwners([FILL, PLAYER_C], "Vi")).toEqual([
      { playerId: FILL.id, role: "JUNGLE" },
      { playerId: PLAYER_C.id, role: "JUNGLE" },
    ]);
  });

  it("orders lineups so additional roles come after primary and secondary placements", () => {
    const players = LINEUP.map((p) => (p.id === PLAYER_A.id ? FILL : p));
    const options = enumerateLegalAssignments(players);
    expect(options[0]!.roleCost).toBe(0);
    for (let i = 1; i < options.length; i++) expect(options[i]!.roleCost).toBeGreaterThanOrEqual(options[i - 1]!.roleCost);
    // Older snapshots without the field behave exactly as before.
    expect(legalRolesFor({ ...PLAYER_A, additionalRoles: undefined })).toEqual(["TOP", "MID"]);
  });
});
