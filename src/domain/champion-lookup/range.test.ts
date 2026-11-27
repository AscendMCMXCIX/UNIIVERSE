import { describe, expect, it } from "vitest";
import abilityFixture from "@/server/riot/fixtures/champion-abilities.fixture.json";
import table from "@/server/riot/static/ability-ranges.reviewed.json";
import { GLOBAL_FROM, REACH_ABOVE, REACH_BELOW, TWO_FORMS, rangeDisplay, rangeStatus, reachOk, reviewMatches, shownReach, type RangeReview } from "./range";
import type { DdragonAbility, DdragonChampionAbilities } from "./types";

/*
  Champion Intel's ability ranges (docs/CHAMPION_INTEL.md, "Ranges"): the reviewed rule on every
  branch, and on every spell of the offline fixture (Data Dragon 16.22.1) with the committed table.
*/

const fixture = (abilityFixture as unknown as { champions: Record<string, DdragonChampionAbilities> }).champions;
const rows = (table as unknown as { rows: RangeReview[] }).rows;
const spell = (over: Partial<DdragonAbility> = {}): DdragonAbility => ({ slot: "Q", id: "AhriQ", name: "Orb of Deception", icon: "AhriQ.png", maxRank: 5, cooldown: [7, 7, 7, 7, 7], charges: null, description: "Ahri sends out and pulls back her orb.", textHash: "96e908d4202f8204", range: [970, 970, 970, 970, 970], ...over });
const review = (over: Partial<RangeReview> = {}): RangeReview => ({ champion: "Ahri", slot: "Q", spell: "AhriQ", kind: "reach", range: [970, 970, 970, 970, 970], textHash: "96e908d4202f8204", version: "16.23.1", reviewed: "2026-11-27", reviewer: "automated draft", ...over });

describe("the reviewed rule", () => {
  it("shows Data Dragon's number for a reach whose key still matches: the spell id, the range and Riot's text", () => {
    expect(rangeDisplay(spell(), review())).toEqual({ kind: "reach", values: [970, 970, 970, 970, 970], reviewedVersion: "16.23.1", reviewer: "automated draft" });
    expect(rangeDisplay(spell({ slot: "R", maxRank: 3, range: [1300, 1550, 1800] }), review({ slot: "R", range: [1300, 1550, 1800] }))).toMatchObject({ kind: "reach", values: [1300, 1550, 1800] });
    expect(rangeDisplay(spell({ range: [25000, 25000, 25000, 25000, 25000] }), review({ kind: "global", range: [25000, 25000, 25000, 25000, 25000] }))).toEqual({ kind: "global", reviewedVersion: "16.23.1", reviewer: "automated draft" });
    expect(rangeDisplay(spell(), review({ kind: "self", reviewer: "owner" }))).toEqual({ kind: "self", reviewedVersion: "16.23.1", reviewer: "owner" });
  });

  it("shows nothing with no row, a row of kind none, on the passive, or on a record stored before rules format 5", () => {
    expect(rangeDisplay(spell(), null)).toBeNull();
    expect(rangeDisplay(spell(), undefined)).toBeNull();
    expect(rangeDisplay(spell(), review({ kind: "none", why: "not-the-reach" }))).toBeNull();
    expect(rangeDisplay(spell({ slot: "P", id: null }), review())).toBeNull();
    expect(rangeDisplay(spell({ range: undefined }), review())).toBeNull();
    expect(rangeDisplay(null, review())).toBeNull();
    // A row for another slot is not this ability's.
    expect(rangeDisplay(spell({ slot: "W" }), review())).toBeNull();
  });

  it("hides the range, and says it waits for a review, when Riot changed the spell id, the range or the text since the row", () => {
    const changed = { kind: "changed", reviewedKind: "reach", reviewedVersion: "16.23.1" };
    expect(rangeDisplay(spell({ id: "AhriQ2" }), review())).toEqual(changed);
    expect(rangeDisplay(spell({ range: [1000, 1000, 1000, 1000, 1000] }), review())).toEqual(changed);
    expect(rangeDisplay(spell({ range: [970, 970, 970, 970] }), review())).toEqual(changed);
    expect(rangeDisplay(spell({ textHash: "0000000000000000" }), review())).toEqual(changed);
    expect(rangeDisplay(spell({ textHash: null }), review())).toEqual(changed);
    // The row's kind goes with it, so a row that showed nothing never says a range is waiting.
    expect(rangeDisplay(spell({ textHash: "0000000000000000" }), review({ kind: "self" }))).toEqual({ ...changed, reviewedKind: "self" });
    expect(reviewMatches(spell(), review())).toBe(true);
  });

  it("never shows a number that fails validation, even where a row says reach: a placeholder, the engine's unlimited, too few ranks, smaller at a higher rank, two abilities in one slot", () => {
    for (const range of [[0, 0, 0, 0, 0], [20, 20, 20, 20, 20], [50, 50, 50, 50, 50], [25000, 25000, 25000, 25000, 25000], [10000, 10000, 10000, 10000, 10000], [3000, 4500, 6000, 3000, 3000]]) {
      expect(rangeDisplay(spell({ range }), review({ range })), range.join("/")).toBeNull();
    }
    expect(rangeDisplay(spell({ maxRank: 3 }), review())).toBeNull();
    expect(rangeDisplay(spell({ name: "To the Skies! / Shock Blast" }), review())).toBeNull();
    expect(rangeDisplay(spell({ name: "Arc of Judgment | Arc of Ruin" }), review())).toBeNull();
    // A global row needs the engine's number.
    expect(rangeDisplay(spell(), review({ kind: "global" }))).toBeNull();
    expect(reachOk([51, 9999], 2)).toBe(true);
    expect(reachOk([], 0)).toBe(false);
    expect([REACH_BELOW, REACH_ABOVE, GLOBAL_FROM]).toEqual([50, 10_000, 5_000]);
    expect(TWO_FORMS.test("Sonic Wave / Resonating Strike")).toBe(true);
    expect(TWO_FORMS.test("Zap!")).toBe(false);
  });

  it("marks a row shown (a reach or Global), self, changed or none, and shows one number where every rank has the same", () => {
    expect(rangeStatus(rangeDisplay(spell(), review()))).toBe("shown");
    expect(rangeStatus({ kind: "global", reviewedVersion: "16.23.1", reviewer: "owner" })).toBe("shown");
    expect(rangeStatus({ kind: "self", reviewedVersion: "16.23.1", reviewer: "owner" })).toBe("self");
    expect(rangeStatus({ kind: "changed", reviewedKind: "reach", reviewedVersion: "16.23.1" })).toBe("changed");
    expect(rangeStatus(null)).toBe("none");
    expect(shownReach([970, 970, 970])).toEqual([970]);
    expect(shownReach([1300, 1550, 1800])).toEqual([1300, 1550, 1800]);
  });
});

describe("every spell of the offline fixture (Data Dragon 16.22.1) with the committed table", () => {
  const byKey = new Map(rows.map((r) => [`${r.champion}:${r.slot}`, r]));
  const all = Object.values(fixture).flatMap((c) => c.abilities.map((a) => ({ champion: c.championId, a, display: rangeDisplay(a, a.slot === "P" ? null : (byKey.get(`${c.championId}:${a.slot}`) ?? null)) })));

  it("never shows a range on a passive, a placeholder or the engine's unlimited, or on a slot of two abilities", () => {
    for (const { champion, a, display } of all) {
      if (a.slot === "P") expect(display, `${champion} P`).toBeNull();
      if (display?.kind === "reach") {
        expect(display.values.every((v) => v > 50 && v < 10_000), `${champion} ${a.slot}`).toBe(true);
        expect(display.values).toHaveLength(a.maxRank);
        expect(TWO_FORMS.test(a.name), `${champion} ${a.slot}`).toBe(false);
        // The number shown is Riot's own, which is the reviewed one.
        expect(display.values, `${champion} ${a.slot}`).toEqual(a.range);
      }
    }
  });

  it("shows the counts the reviewed table gives at 16.22.1: every row's key matches but Mel's W (Riot changed it at 16.23.1; a self row, so nothing is shown either way)", () => {
    const count = (k: string) => all.filter((x) => x.a.slot !== "P" && (x.display?.kind ?? "none") === k).length;
    expect({ reach: count("reach"), global: count("global"), self: count("self"), changed: count("changed") }).toEqual({ reach: 269, global: 11, self: 180, changed: 1 });
    // Ahri, the Production check's champion: her Q, E and R shown, as Riot's numbers, from the automated review.
    const ahri = all.filter((x) => x.champion === "Ahri" && x.display?.kind === "reach").map((x) => [x.a.slot, rangeDisplay(x.a, byKey.get(`Ahri:${x.a.slot}`))]);
    expect(ahri).toEqual([
      ["Q", { kind: "reach", values: [970, 970, 970, 970, 970], reviewedVersion: "16.23.1", reviewer: "automated review" }],
      ["E", { kind: "reach", values: [975, 975, 975, 975, 975], reviewedVersion: "16.23.1", reviewer: "automated review" }],
      ["R", { kind: "reach", values: [450, 450, 450], reviewedVersion: "16.23.1", reviewer: "automated review" }],
    ]);
  });
});
