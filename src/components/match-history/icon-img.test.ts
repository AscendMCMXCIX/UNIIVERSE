import { describe, expect, it } from "vitest";
import { iconInitials } from "./icon-img";

/*
  A Riot icon whose image fails (Data Dragon down, a blocked host, the installed app offline) shows
  a stand-in with its initials (IconImg), never the plain tile of an empty slot: the letters must
  name the item, spell or rune, from the name Data Dragon gives it.
*/

describe("a failed icon's initials", () => {
  it("take the first letters of the first two capitalised words", () => {
    expect(iconInitials("Plated Steelcaps")).toBe("PS");
    expect(iconInitials("Lord Dominik's Regards")).toBe("LD");
    expect(iconInitials("Zaz'Zak's Realmspike")).toBe("ZR");
    expect(iconInitials("B. F. Sword")).toBe("BF");
    expect(iconInitials("Legend: Alacrity")).toBe("LA");
    // Small words in between are skipped while two capitalised words remain.
    expect(iconInitials("Hail of Blades")).toBe("HB");
    expect(iconInitials("Locket of the Iron Solari")).toBe("LI");
  });

  it("fall back to the first two words, then to a single word's first two letters", () => {
    expect(iconInitials("Press the Attack")).toBe("PA");
    expect(iconInitials("Flash")).toBe("Fl");
    expect(iconInitials("Ignite")).toBe("Ig");
    expect(iconInitials("Conqueror")).toBe("Co");
    expect(iconInitials("Stormraider's Surge")).toBe("SS");
  });

  it("skip numbers, so an item Data Dragon has not named yet still reads as an item", () => {
    expect(iconInitials("Item 3047")).toBe("It");
    expect(iconInitials("3047")).toBe("30");
    expect(iconInitials("  ")).toBe("");
  });
});
