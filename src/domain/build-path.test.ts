import { describe, expect, it } from "vitest";
import { buildPath, itemKindsOf, maxOrder, shopVisits, skillGrid } from "./build-path";

describe("the build path", () => {
  it("puts purchases and sales in the order they happened, a sale first at the same moment", () => {
    const path = buildPath(
      [
        [1_000, 1055],
        [1_400, 2003],
        [400_000, 3006],
        [1_500_000, 3031],
      ],
      [[1_500_000, 1055]],
    );
    expect(path.map((e) => `${e.kind} ${e.id} @${e.ms}`)).toEqual(["buy 1055 @1000", "buy 2003 @1400", "buy 3006 @400000", "sell 1055 @1500000", "buy 3031 @1500000"]);
  });

  it("drops what cannot be an event (a negative time, an empty slot), and needs no sales", () => {
    expect(buildPath([[-5, 1055], [1_000, 0], [2_000, 3020]])).toEqual([{ ms: 2_000, kind: "buy", id: 3020 }]);
  });

  it("groups events less than 45 seconds apart as one shop visit", () => {
    const visits = shopVisits([{ ms: 1_000 }, { ms: 1_400 }, { ms: 300_000 }, { ms: 330_000 }, { ms: 400_000 }]);
    expect(visits.map((v) => v.length)).toEqual([2, 2, 1]);
  });
});

describe("the skill order", () => {
  it("is a grid of the levels each skill was taken at, at most 18", () => {
    const order = [1, 3, 2, 1, 1, 4, 1, 3, 1, 3, 4, 3, 3, 2, 2, 4, 2, 2, 1];
    const g = skillGrid(order);
    expect(g.levels).toBe(18);
    expect(g.rows.Q).toEqual([1, 4, 5, 7, 9]);
    expect(g.rows.R).toEqual([6, 11, 16]);
    expect(g.rows.W).toEqual([3, 14, 15, 17, 18]);
    expect(g.rows.E).toEqual([2, 8, 10, 12, 13]);
  });

  it("ignores what is not a skill slot, and an unfinished game has fewer points", () => {
    expect(skillGrid([1, 0, 5, 2]).levels).toBe(2);
    expect(skillGrid([]).levels).toBe(0);
  });

  it("names the order the basic skills were maxed in", () => {
    expect(maxOrder([1, 3, 2, 1, 1, 4, 1, 3, 1, 3, 4, 3, 3, 2, 2, 4, 2, 2])).toEqual(["Q", "E", "W"]);
    // Unfinished: by points, then by the first taken.
    expect(maxOrder([3, 1, 3, 1])).toEqual(["E", "Q"]);
  });
});

describe("the item kinds from Data Dragon", () => {
  it("marks finished Rift items and upgraded boots, and consumables, trinkets and wards as minor", () => {
    const kinds = itemKindsOf({
      "3031": { into: [], gold: { total: 3_400 }, tags: ["Damage"], maps: { "11": true } },
      "1038": { into: ["3031"], gold: { total: 1_300 }, tags: ["Damage"], maps: { "11": true } },
      "1055": { into: [], gold: { total: 450 }, tags: ["Damage", "Lane"], maps: { "11": true } },
      "3006": { into: ["3172"], gold: { total: 1_100 }, tags: ["Boots"], depth: 2, maps: { "11": true } },
      "1001": { into: ["3006"], gold: { total: 300 }, tags: ["Boots"], depth: 1, maps: { "11": true } },
      "2003": { gold: { total: 50 }, tags: ["Consumable"], maps: { "11": true } },
      "3340": { gold: { total: 0 }, tags: ["Trinket", "Vision"], maps: { "11": true } },
      "2055": { gold: { total: 75 }, tags: ["Consumable", "Vision"], maps: { "11": true } },
      "223031": { into: [], gold: { total: 3_400 }, tags: [], maps: { "11": true } },
      "3032": { into: [], gold: { total: 3_000 }, tags: [], maps: { "11": false, "12": true } },
    });
    expect(kinds.done).toEqual([3006, 3031]);
    expect(kinds.minor).toEqual([2003, 2055, 3340]);
  });
});
