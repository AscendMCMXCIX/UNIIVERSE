import { describe, expect, it } from "vitest";
import { canPlayRole, eligibleChampions, flexOwners, legalRolesFor, poolFor } from "./eligibility";
import { LINEUP, PLAYER_A, PLAYER_C, PLAYER_D, PLAYER_E } from "../../../tests/fixtures/players";

describe("champion eligibility", () => {
  it("uses the primary pool in the primary role and the secondary pool in the secondary role", () => {
    expect(poolFor(PLAYER_A, "TOP")).toEqual(["Riven", "Gwen", "Ambessa"]);
    expect(poolFor(PLAYER_A, "MID")).toEqual(["Ahri", "Lissandra"]);
  });

  it("never exposes the secondary pool outside the secondary role, or any pool in an illegal role", () => {
    // Riven can technically be played mid, but Player A has not configured it there.
    expect(poolFor(PLAYER_A, "MID")).not.toContain("Riven");
    expect(poolFor(PLAYER_A, "JUNGLE")).toEqual([]);
    expect(poolFor(PLAYER_A, "ADC")).toEqual([]);
    expect(poolFor(PLAYER_C, "MID")).toEqual([]);
  });

  it("limits legal roles to the configured primary and secondary", () => {
    expect(legalRolesFor(PLAYER_A)).toEqual(["TOP", "MID"]);
    expect(legalRolesFor(PLAYER_C)).toEqual(["JUNGLE"]);
    expect(canPlayRole(PLAYER_C, "TOP")).toBe(false);
    expect(canPlayRole(PLAYER_E, "ADC")).toBe(true);
  });

  it("removes banned and picked champions from eligibility", () => {
    const ctx = { unavailableChampionIds: new Set(["Riven", "Ahri"]) };
    expect(eligibleChampions(PLAYER_A, "TOP", ctx)).toEqual(["Gwen", "Ambessa"]);
    expect(eligibleChampions(PLAYER_A, "MID", ctx)).toEqual(["Lissandra"]);
  });

  it("identifies real UNIIVERSE flexes from player configuration only", () => {
    // Nautilus sits in Player E's primary (support) pool and Player D's secondary (support) pool.
    expect(flexOwners(LINEUP, "Nautilus")).toEqual([
      { playerId: PLAYER_D.id, role: "SUPPORT" },
      { playerId: PLAYER_E.id, role: "SUPPORT" },
    ]);
    // Gragas is a famous pro flex, but nobody here has it configured → not a UNIIVERSE flex.
    expect(flexOwners(LINEUP, "Gragas")).toEqual([]);
  });
});
