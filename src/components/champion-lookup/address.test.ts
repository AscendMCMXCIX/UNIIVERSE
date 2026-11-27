import { describe, expect, it } from "vitest";
import { LOOKUP_PATH, hasteFromAddress, intelHref, laneFromAddress, legacyMatchupRedirect, lookupHref, paramOf, queueFromAddress, roleFromAddress, swappedHref, withoutHref } from "./address";
import { parseRecent, withRecent, RECENT_MAX } from "./recent";

/* Champion Intel's address and Matchup Intel's old links (docs/CHAMPION_INTEL.md, "Address"), and the device's Recent list. */

describe("the address", () => {
  it("carries the champion and the haste, each left out when empty", () => {
    expect(LOOKUP_PATH).toBe("/lookup");
    expect(lookupHref()).toBe("/lookup");
    expect(lookupHref("Ahri")).toBe("/lookup?champion=Ahri");
    expect(lookupHref("Ahri", 20)).toBe("/lookup?champion=Ahri&haste=20");
    expect(lookupHref("Ahri", 0)).toBe("/lookup?champion=Ahri");
    expect(lookupHref(null, 40)).toBe("/lookup?haste=40");
    // A haste is held to the page's rule.
    expect(lookupHref("Ahri", 9999)).toBe("/lookup?champion=Ahri&haste=300");
    expect(lookupHref("Ahri", -3)).toBe("/lookup?champion=Ahri");
  });

  it("carries a second champion and its haste beside the first, each haste left out at 0", () => {
    expect(intelHref({ id: "Ahri", haste: 20 }, { id: "Jinx", haste: 0 })).toBe("/lookup?champion=Ahri&haste=20&champion2=Jinx");
    expect(intelHref({ id: "Ahri", haste: 0 }, { id: "Jinx", haste: 35 })).toBe("/lookup?champion=Ahri&champion2=Jinx&haste2=35");
    expect(intelHref({ id: "Ahri", haste: 999 }, { id: "Jinx", haste: 999 })).toBe("/lookup?champion=Ahri&haste=300&champion2=Jinx&haste2=300");
    // The same champion twice is allowed: two hastes side by side.
    expect(intelHref({ id: "Ahri", haste: 0 }, { id: "Ahri", haste: 50 })).toBe("/lookup?champion=Ahri&champion2=Ahri&haste2=50");
    // A second with no first is written as the first; no second is no second.
    expect(intelHref({ id: null, haste: 0 }, { id: "Jinx", haste: 10 })).toBe("/lookup?champion=Jinx&haste=10");
    expect(intelHref({ id: "Ahri", haste: 10 }, null)).toBe("/lookup?champion=Ahri&haste=10");
    expect(intelHref(null, null)).toBe("/lookup");
  });

  it("swaps two champions, each keeping its own haste (Compare's Swap)", () => {
    expect(swappedHref({ id: "Ahri", haste: 20 }, { id: "Jinx", haste: 0 })).toBe("/lookup?champion=Jinx&champion2=Ahri&haste2=20");
    expect(swappedHref({ id: "Ahri", haste: 0 }, { id: "Jinx", haste: 35 })).toBe("/lookup?champion=Jinx&haste=35&champion2=Ahri");
    expect(swappedHref({ id: "Udyr", haste: 40 }, { id: "LeeSin", haste: 10 })).toBe("/lookup?champion=LeeSin&haste=10&champion2=Udyr&haste2=40");
    // Swapped twice, the address is the one it started from.
    const start = { id: "Teemo", haste: 55 };
    const other = { id: "Jayce", haste: 10 };
    expect(swappedHref(other, start)).toBe(intelHref(start, other));
  });

  it("removes either champion: the first's removal makes the second the first, its haste with it", () => {
    const a = { id: "Ahri", haste: 20 };
    const b = { id: "Jinx", haste: 50 };
    expect(withoutHref(a, b, 1)).toBe("/lookup?champion=Ahri&haste=20");
    expect(withoutHref(a, b, 0)).toBe("/lookup?champion=Jinx&haste=50");
    expect(withoutHref({ id: "Ahri", haste: 0 }, { id: "Ahri", haste: 0 }, 0)).toBe("/lookup?champion=Ahri");
  });

  it("carries each champion's builds role where one was chosen, and old addresses without one still open", () => {
    expect(intelHref({ id: "Leona", haste: 0, role: "ADC" })).toBe("/lookup?champion=Leona&role=ADC");
    expect(intelHref({ id: "Leona", haste: 20, role: null }, { id: "Thresh", haste: 0, role: "SUPPORT" })).toBe("/lookup?champion=Leona&haste=20&champion2=Thresh&role2=SUPPORT");
    // Swap and removal keep each role with its champion.
    expect(swappedHref({ id: "Leona", haste: 0, role: "ADC" }, { id: "Thresh", haste: 10 })).toBe("/lookup?champion=Thresh&haste=10&champion2=Leona&role2=ADC");
    expect(withoutHref({ id: "Leona", haste: 0, role: "ADC" }, { id: "Thresh", haste: 0, role: "SUPPORT" }, 0)).toBe("/lookup?champion=Thresh&role=SUPPORT");
    // No champion, no role.
    expect(intelHref({ id: null, haste: 0, role: "TOP" })).toBe("/lookup");
    expect(roleFromAddress("support")).toBe("SUPPORT");
    expect(roleFromAddress(["ADC", "TOP"])).toBe("ADC");
    expect(roleFromAddress("UTILITY")).toBeNull();
    expect(roleFromAddress(undefined)).toBeNull();
    expect(lookupHref("Ahri")).toBe("/lookup?champion=Ahri");
  });

  it("hands the server a parameter's first value, trimmed, or nothing", () => {
    expect(paramOf(" Jinx ")).toBe("Jinx");
    expect(paramOf(["Jinx", "Ahri"])).toBe("Jinx");
    expect(paramOf("  ")).toBeUndefined();
    expect(paramOf(undefined)).toBeUndefined();
  });

  it("reads a haste from the address, whole and bounded, else 0", () => {
    expect(hasteFromAddress("20")).toBe(20);
    expect(hasteFromAddress(["40", "60"])).toBe(40);
    expect(hasteFromAddress("1000")).toBe(300);
    expect(hasteFromAddress("12.7")).toBe(12);
    expect(hasteFromAddress("9999999")).toBe(300);
    for (const v of [undefined, "", "abc", "-5", "1e3", "20px", "9".repeat(50)]) expect(hasteFromAddress(v), String(v)).toBe(0);
  });
});

describe("Matchup Intel's lane and the page's queue", () => {
  it("write the lane only with two champions, after both, and the queue only when it is not Ranked Solo/Duo", () => {
    expect(intelHref({ id: "Riven", haste: 0 }, { id: "Darius", haste: 0 }, { lane: "TOP" })).toBe("/lookup?champion=Riven&champion2=Darius&lane=TOP");
    expect(intelHref({ id: "Jinx", haste: 0, role: "ADC" }, { id: "Caitlyn", haste: 10 }, { lane: "ADC", queue: "flex" })).toBe("/lookup?champion=Jinx&role=ADC&champion2=Caitlyn&haste2=10&lane=BOTTOM&queue=flex");
    expect(intelHref({ id: "Riven", haste: 0 }, null, { lane: "TOP" })).toBe("/lookup?champion=Riven");
    expect(intelHref({ id: "Riven", haste: 0 }, null, { queue: "clash" })).toBe("/lookup?champion=Riven&queue=clash");
    expect(intelHref({ id: "Riven", haste: 0 }, { id: "Darius", haste: 0 }, { lane: null, queue: "solo" })).toBe("/lookup?champion=Riven&champion2=Darius");
  });

  it("keep the lane and the queue on Swap (the other side of the same lane); drop the lane, never the queue, on ✕", () => {
    const a = { id: "Riven", haste: 0 };
    const b = { id: "Darius", haste: 20 };
    expect(swappedHref(a, b, { lane: "TOP", queue: "draft" })).toBe("/lookup?champion=Darius&haste=20&champion2=Riven&lane=TOP&queue=draft");
    expect(withoutHref(a, b, 1, { lane: "TOP", queue: "draft" })).toBe("/lookup?champion=Riven&queue=draft");
    expect(withoutHref(a, b, 0, { lane: "TOP" })).toBe("/lookup?champion=Darius&haste=20");
  });

  it("read a lane in any spelling of a position, and a queue key in any case, Ranked Solo/Duo for anything else", () => {
    expect(laneFromAddress("MID")).toBe("MID");
    expect(laneFromAddress("BOTTOM")).toBe("ADC");
    expect(laneFromAddress(["bot", "top"])).toBe("ADC");
    expect(laneFromAddress("support")).toBe("SUPPORT");
    expect(laneFromAddress("middle")).toBe("MID");
    expect(laneFromAddress("nowhere")).toBeNull();
    expect(laneFromAddress("x".repeat(40))).toBeNull();
    expect(laneFromAddress(undefined)).toBeNull();
    expect(queueFromAddress("FLEX")).toBe("flex");
    expect(queueFromAddress(["clash", "draft"])).toBe("clash");
    expect(queueFromAddress("aram")).toBe("solo");
    expect(queueFromAddress(undefined)).toBe("solo");
  });
});

describe("Matchup Intel's old links", () => {
  // Changed on 27 Nov 2026 (the owner's request to bring Matchup Intel back inside Champion Intel's
  // Compare): both champions and the lane are carried, where until then only one champion was.
  it("carry both champions and the lane: your champion first, the enemy second", () => {
    expect(legacyMatchupRedirect({})).toBe("/lookup");
    expect(legacyMatchupRedirect({ role: "top", champion: "Riven", vs: "Mordekaiser" })).toBe("/lookup?champion=Riven&champion2=Mordekaiser&lane=TOP");
    expect(legacyMatchupRedirect({ champion: "Riven", vs: "Mordekaiser" })).toBe("/lookup?champion=Riven&champion2=Mordekaiser");
    expect(legacyMatchupRedirect({ role: "adc", champion: "Jinx", ally: "Lulu", vs: "Caitlyn", vs2: "Lux" })).toBe("/lookup?champion=Jinx&champion2=Caitlyn&lane=BOTTOM");
    expect(legacyMatchupRedirect({ role: "nowhere", champion: "Ahri", vs: "Zed" })).toBe("/lookup?champion=Ahri&champion2=Zed");
  });

  it("carry one champion alone, with no lane: the enemy or yours, else the other enemy, else the duo partner", () => {
    expect(legacyMatchupRedirect({ vs: "Mordekaiser", role: "top" })).toBe("/lookup?champion=Mordekaiser");
    expect(legacyMatchupRedirect({ champion: "Riven", role: "top" })).toBe("/lookup?champion=Riven");
    expect(legacyMatchupRedirect({ role: "adc", ally: "Lulu", vs2: "Lux" })).toBe("/lookup?champion=Lux");
    expect(legacyMatchupRedirect({ role: "support", ally: "Lulu" })).toBe("/lookup?champion=Lulu");
    // An ability's details are dropped.
    expect(legacyMatchupRedirect({ role: "mid", ability: "Ahri.Q" })).toBe("/lookup");
    // A repeated parameter reads its first; an empty one names nothing; a value too long to be a champion is left out.
    expect(legacyMatchupRedirect({ vs: ["Zed", "Ahri"] })).toBe("/lookup?champion=Zed");
    expect(legacyMatchupRedirect({ vs: "  ", champion: "Riven" })).toBe("/lookup?champion=Riven");
    expect(legacyMatchupRedirect({ vs: "x".repeat(65), champion: "Riven" })).toBe("/lookup?champion=Riven");
    // Anything else is carried as the value it is, encoded; Champion Intel checks it against the roster.
    expect(legacyMatchupRedirect({ vs: "Kha'Zix" })).toBe("/lookup?champion=Kha%27Zix");
    expect(legacyMatchupRedirect({ vs: "a&b=c" })).toBe("/lookup?champion=a%26b%3Dc");
  });
});

describe("the champions looked up lately", () => {
  it("keeps ids only, newest first, without repeats, at most eight", () => {
    expect(parseRecent(null)).toEqual([]);
    expect(parseRecent("not json")).toEqual([]);
    expect(parseRecent(JSON.stringify(["Ahri", "Ahri", "<b>", 5, "Zed"]))).toEqual(["Ahri", "Zed"]);
    let list: string[] = [];
    for (const id of ["A", "B", "C", "D", "E", "F", "G", "H", "I", "B"]) list = withRecent(list, id);
    expect(list).toEqual(["B", "I", "H", "G", "F", "E", "D", "C"]);
    expect(list).toHaveLength(RECENT_MAX);
    expect(withRecent(["Ahri"], "not an id!")).toEqual(["Ahri"]);
  });
});
