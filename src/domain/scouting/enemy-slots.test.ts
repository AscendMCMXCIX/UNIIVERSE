import { describe, expect, it } from "vitest";
import { enemyNameList, enemySlotsFromList, inferEnemyRoles } from "./enemy-slots";

describe("enemy players without roles", () => {
  it("keeps names in entry order, any number from zero to five", () => {
    expect(enemyNameList({})).toEqual([]);
    const slots = enemySlotsFromList(["A#1", " ", "B#2", "C"]);
    expect(enemyNameList(slots)).toEqual(["A#1", "B#2", "C"]);
    expect(enemyNameList(enemySlotsFromList(["1", "2", "3", "4", "5", "6"]))).toHaveLength(5);
  });

  it("infers each player's role from their own games, never from entry order", () => {
    // Entered first, but plays jungle; entered second, plays top.
    const roles = inferEnemyRoles([
      { key: "first", games: { JUNGLE: 18, TOP: 2 } },
      { key: "second", games: { TOP: 20 } },
      { key: "third", games: { MID: 3, JUNGLE: 3 } },
      { key: "unknown", games: {} },
    ]);
    expect(roles.get("first")).toMatchObject({ role: "JUNGLE", certainty: 0.9 });
    expect(roles.get("second")).toMatchObject({ role: "TOP", certainty: 1 });
    // Jungle is taken, so the mid/jungle player is placed mid with half certainty.
    expect(roles.get("third")).toMatchObject({ role: "MID", certainty: 0.5 });
    // No games: a free role with zero certainty (the engine barely uses it).
    expect(roles.get("unknown")?.certainty).toBe(0);
    expect(new Set([...roles.values()].map((r) => r.role)).size).toBe(4);
  });
});
