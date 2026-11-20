import { describe, expect, it } from "vitest";
import { confirmedOpponent, isCompletedItem, laneEnd, matchPrep, regionOf, runePageKey, parseRunePage, skillOrder, type PrepParticipant, type PrepTimeline } from "./prep";

const LANES = ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"] as const;
/** Ten players, Riot's two readings agreeing; the member is blue's top (slot 0). */
function game(over: (p: PrepParticipant, i: number) => Partial<PrepParticipant> = () => ({})): PrepParticipant[] {
  return Array.from({ length: 10 }, (_, i) => {
    const lane = LANES[i % 5]!;
    const p: PrepParticipant = { puuid: `p${i}`, teamId: i < 5 ? 100 : 200, championId: `C${i}`, position: lane, teamPosition: lane, individualPosition: lane, spells: [14, 4], runes: { keystone: 8010, primary: 8000, secondary: 8400, primaryPerks: [8010, 9111, 9104, 8299], secondaryPerks: [8446, 8451] } };
    return { ...p, ...over(p, i) };
  });
}

describe("the confirmed-opponent rule (mi-evidence §2.1)", () => {
  it("confirms the enemy in the lane when both readings agree for both players", () => {
    expect(confirmedOpponent(game(), 0)).toEqual({ slot: 5, rule: "confirmed" });
  });

  it("counts no game whose individual position disagrees, for either player", () => {
    expect(confirmedOpponent(game((p, i) => (i === 5 ? { individualPosition: "MIDDLE" } : {})), 0)).toBeNull();
    expect(confirmedOpponent(game((p, i) => (i === 0 ? { individualPosition: "Invalid" } : {})), 0)).toBeNull();
  });

  it("counts no game where a team's five team positions are not all different, or one is empty", () => {
    expect(confirmedOpponent(game((p, i) => (i === 7 ? { teamPosition: "TOP" } : {})), 0)).toBeNull();
    expect(confirmedOpponent(game((p, i) => (i === 3 ? { teamPosition: "" } : {})), 0)).toBeNull();
  });

  it("never falls back to the individual position on a record that keeps both readings", () => {
    expect(confirmedOpponent(game((p, i) => (i === 0 ? { teamPosition: "" } : {})), 0)).toBeNull();
  });

  it("reads an older record (one merged position) by the lane opponent rule, marked as by position", () => {
    const old = game().map(({ teamPosition: _t, individualPosition: _i, ...p }) => p);
    expect(confirmedOpponent(old, 0)).toEqual({ slot: 5, rule: "position" });
  });
});

describe("matchPrep", () => {
  const timeline: PrepTimeline = {
    participants: [{ puuid: "p0", purchases: [[15_000, 1055], [16_000, 2003], [300_000, 1036], [310_000, 3340], [500_000, 3071], [900_000, 6333], [1_200_000, 3053]], skills: [1, 3, 2, 1, 1, 4, 1, 1, 3, 3, 4, 3, 3, 2, 2, 2, 2, 4] }],
    events: { objectives: [{ t: 400_000, team: 100, kind: "dragon" }, { t: 600_000, team: 200, kind: "grubs" }, { t: 1_000_000, team: 100, kind: "dragon" }] },
  };
  const items = { "1055": { gold: { total: 450 }, tags: [], into: ["3071"], depth: 1 }, "2003": { gold: { total: 50 }, tags: ["Consumable"], into: [], depth: 1 }, "1036": { gold: { total: 350 }, tags: [], into: ["3071"], depth: 1 }, "3340": { gold: { total: 0 }, tags: ["Trinket"], into: [], depth: 1 }, "3071": { gold: { total: 3000 }, tags: [], into: [], depth: 3 }, "6333": { gold: { total: 3000 }, tags: [], into: [], depth: 3 }, "3053": { gold: { total: 3000 }, tags: [], into: [], depth: 2 } };

  it("keeps the lane, the opponent, runes, spells, the starting set, the first visit, the completed items and the skill order", () => {
    expect(matchPrep(game(), 0, timeline, items)).toEqual({ f: 1, lane: "TOP", rule: "confirmed", vs: "C5", ks: 8010, runes: "8000:8010,9111,9104,8299|8400:8446,8451", spells: "4,14", start: "1055,2003", back: "1036,3340", items: "3071>6333>3053", skills: "QEW", max: "QEW", tl: true });
  });

  it("leaves the completed items out when an item bought is unknown to Data Dragon's facts (never skipped over)", () => {
    const { "6333": _gone, ...partial } = items;
    expect(matchPrep(game(), 0, timeline, partial)?.items).toBeUndefined();
    expect(matchPrep(game(), 0, timeline, null)?.items).toBeUndefined();
  });

  it("keeps only the record's fields without a timeline, and nothing for a removed player", () => {
    expect(matchPrep(game(), 0, null, items)).toEqual({ f: 1, lane: "TOP", rule: "confirmed", vs: "C5", ks: 8010, runes: "8000:8010,9111,9104,8299|8400:8446,8451", spells: "4,14", tl: false });
    expect(matchPrep(game((p, i) => (i === 0 ? { removed: true } : {})), 0, null, items)).toBeNull();
  });

  it("names no opponent when the role is unclear, but keeps the member's own choices", () => {
    const prep = matchPrep(game((p, i) => (i === 5 ? { individualPosition: "JUNGLE" } : {})), 0, null, items)!;
    expect(prep.rule).toBeNull();
    expect(prep.vs).toBeUndefined();
    expect(prep.spells).toBe("4,14");
  });

  it("gives a bot laner their partner and the enemy partner, each by the same rule", () => {
    const tl: PrepTimeline = { participants: [{ puuid: "p3", purchases: [], skills: [] }] };
    expect(matchPrep(game(), 3, tl, items)).toMatchObject({ lane: "BOTTOM", vs: "C8", ally: "C4", vs2: "C9" });
    expect(matchPrep(game(), 4, null, items)).toMatchObject({ lane: "UTILITY", vs: "C9", ally: "C3", vs2: "C8" });
    // The enemy support's readings disagree: the pair is not confirmed, the lane opponent still is.
    const prep = matchPrep(game((p, i) => (i === 9 ? { individualPosition: "MIDDLE" } : {})), 3, null, items)!;
    expect(prep.vs).toBe("C8");
    expect(prep.ally).toBeUndefined();
    expect(prep.vs2).toBeUndefined();
  });

  it("counts a jungler's team's dragons, voidgrubs and heralds before 15:00, of all taken", () => {
    const tl: PrepTimeline = { ...timeline, participants: [{ puuid: "p1", purchases: [], skills: [] }] };
    expect(matchPrep(game(), 1, tl, items)?.obj).toEqual({ taken: 1, total: 2 });
  });
});

describe("the pieces", () => {
  it("keys and reads a full rune page, and none from a record with the keystone only", () => {
    const key = runePageKey({ keystone: 8010, primary: 8000, secondary: 8400, primaryPerks: [8010, 9111, 9104, 8299], secondaryPerks: [8446, 8451] })!;
    expect(parseRunePage(key)).toEqual({ primary: 8000, secondary: 8400, perks: [8010, 9111, 9104, 8299, 8446, 8451] });
    expect(runePageKey({ keystone: 8010, primary: 8000, secondary: 8400 })).toBeNull();
  });

  it("calls only finished items completed: not components, boots, consumables or trinkets", () => {
    expect(isCompletedItem({ gold: { total: 3000 }, tags: [], into: [], depth: 3 })).toBe(true);
    expect(isCompletedItem({ gold: { total: 1100 }, tags: ["Boots"], into: [], depth: 2 })).toBe(false);
    expect(isCompletedItem({ gold: { total: 1300 }, tags: [], into: ["3071"], depth: 2 })).toBe(false);
    expect(isCompletedItem(undefined)).toBe(false);
  });

  it("gives the max order only once a skill is maxed", () => {
    expect(skillOrder([1, 2, 3, 1, 1])).toEqual({ skills: "QWE" });
    expect(skillOrder([3, 1, 2, 3, 3, 4, 3, 3, 2, 2])).toEqual({ skills: "EQW", max: "EWQ" });
    expect(skillOrder([1, 2])).toEqual({});
  });

  it("places the lanes and the bases", () => {
    expect(regionOf(1_000, 8_000)).toBe("TOP");
    expect(regionOf(8_000, 14_000)).toBe("TOP");
    expect(regionOf(7_400, 7_400)).toBe("MIDDLE");
    expect(regionOf(12_000, 1_000)).toBe("BOTTOM");
    expect(regionOf(500, 500)).toBe("base");
    expect(regionOf(5_000, 9_500)).toBe("elsewhere");
  });
});

describe("the lane end (mi-evidence §2.3)", () => {
  const t = Array.from({ length: 16 }, (_, i) => i * 60_000);
  const at = (x: number, y: number) => t.map(() => [x, y]);
  const series = (points: Array<[number, number]>) => ({ px: points.map((p) => p[0]), py: points.map((p) => p[1]) });

  it("ends when a player is out of the lane two frames in a row, trips to base not counting", () => {
    const top = at(1_000, 9_000) as Array<[number, number]>;
    const roam = top.map((p, i) => (i === 8 || i === 9 ? ([6_000, 8_000] as [number, number]) : i === 5 ? ([400, 400] as [number, number]) : p));
    const tl: PrepTimeline = { participants: [], frames: { t, p: { a: series(roam), b: series(top) } }, events: { objectives: [] } };
    expect(laneEnd("TOP", "a", "b", tl)).toBe(9 * 60_000);
  });

  it("ends at the lane's outer turret when that comes first, and is not measured without positions", () => {
    const top = at(1_000, 9_000) as Array<[number, number]>;
    const tl: PrepTimeline = { participants: [], frames: { t, p: { a: series(top), b: series(top) } }, events: { objectives: [{ t: 700_000, team: 100, kind: "tower", detail: "TOP OUTER" }, { t: 500_000, team: 100, kind: "tower", detail: "MID OUTER" }] } };
    expect(laneEnd("TOP", "a", "b", tl)).toBe(700_000);
    expect(laneEnd("TOP", "a", "b", { ...tl, frames: { t, p: {} } })).toBeUndefined();
    expect(laneEnd("JUNGLE", "a", "b", tl)).toBeUndefined();
  });
});
