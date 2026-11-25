import { describe, expect, it } from "vitest";
import { LOOKUP_PATH, hasteFromAddress, intelHref, legacyMatchupRedirect, lookupHref, paramOf } from "./address";
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

describe("Matchup Intel's old links", () => {
  it("carry one champion: the enemy where named, else yours, else the other enemy, else the duo partner", () => {
    expect(legacyMatchupRedirect({})).toBe("/lookup");
    expect(legacyMatchupRedirect({ champion: "Riven", vs: "Mordekaiser" })).toBe("/lookup?champion=Mordekaiser");
    expect(legacyMatchupRedirect({ champion: "Riven" })).toBe("/lookup?champion=Riven");
    expect(legacyMatchupRedirect({ role: "adc", champion: "Jinx", ally: "Lulu", vs: "Caitlyn", vs2: "Lux" })).toBe("/lookup?champion=Caitlyn");
    expect(legacyMatchupRedirect({ role: "adc", ally: "Lulu", vs2: "Lux" })).toBe("/lookup?champion=Lux");
    expect(legacyMatchupRedirect({ role: "support", ally: "Lulu" })).toBe("/lookup?champion=Lulu");
    // The lane and an ability's details are dropped.
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
