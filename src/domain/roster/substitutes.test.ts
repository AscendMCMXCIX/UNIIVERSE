import { describe, expect, it } from "vitest";
import { substitutesFor } from "./substitutes";
import type { PlayerGroup, RosterPlayer } from "./types";
import { PLAYER_A, PLAYER_B, PLAYER_C, PLAYER_D, PLAYER_E, PLAYER_SUB } from "../../../tests/fixtures/players";

type Member = RosterPlayer & { group: PlayerGroup };

const lineup = new Set([PLAYER_A.id, PLAYER_B.id, PLAYER_C.id, PLAYER_D.id, PLAYER_E.id]);
const flexBench: Member = { id: "flex", displayName: "Flex", group: "main", primaryRole: "MID", secondaryRole: "TOP", primaryPool: ["Ahri"], secondaryPool: ["Jax"], additionalRoles: [{ role: "SUPPORT", pool: ["Lux"] }] };
const otherTop: Member = { id: "other-top", displayName: "Other Top", group: "other", primaryRole: "TOP", secondaryRole: null, primaryPool: ["Garen"], secondaryPool: [] };
const noRole: Member = { id: "no-role", displayName: "Newcomer", group: "main", primaryRole: null, secondaryRole: null, primaryPool: [], secondaryPool: [] };
const team: Member[] = [PLAYER_A, PLAYER_B, PLAYER_C, PLAYER_D, PLAYER_E, otherTop, flexBench, PLAYER_SUB, noRole];

describe("substitutes for a lineup role", () => {
  it("offers only bench members who list the role, never starters", () => {
    // Player B lists Top as a secondary role but starts at Mid: not a substitute.
    expect(substitutesFor("TOP", team, lineup).map((p) => p.id)).toEqual(["player-sub", "other-top", "flex"]);
    expect(substitutesFor("JUNGLE", team, lineup)).toEqual([]);
  });

  it("puts the best fit first: primary role, then secondary, then additional roles", () => {
    expect(substitutesFor("MID", team, lineup).map((p) => p.id)).toEqual(["flex"]);
    // Flex lists Top second, so the primary-role Top substitute comes first.
    expect(substitutesFor("TOP", team, lineup)[0]!.id).toBe("player-sub");
    // An additional role is a legal role too.
    expect(substitutesFor("SUPPORT", team, lineup).map((p) => p.id)).toEqual(["flex"]);
  });

  it("lists main players before other players at the same fit", () => {
    const top = substitutesFor("TOP", team, lineup);
    expect(top.findIndex((p) => p.id === "player-sub")).toBeLessThan(top.findIndex((p) => p.id === "other-top"));
  });

  it("never offers a member without a chosen role", () => {
    for (const role of ["TOP", "JUNGLE", "MID", "ADC", "SUPPORT"] as const) expect(substitutesFor(role, team, lineup).some((p) => p.id === "no-role")).toBe(false);
  });

  it("follows the lineup: a starter who is benched becomes a substitute for the roles they list", () => {
    const benchedA = new Set([...lineup].filter((id) => id !== PLAYER_A.id).concat(PLAYER_SUB.id));
    expect(substitutesFor("TOP", team, benchedA).map((p) => p.id)).toEqual(["player-a", "other-top", "flex"]);
    expect(substitutesFor("MID", team, benchedA).map((p) => p.id)).toEqual(["flex", "player-a"]);
  });
});
