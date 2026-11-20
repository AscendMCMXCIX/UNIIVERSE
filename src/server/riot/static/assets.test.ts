import { describe, expect, it } from "vitest";
import digest from "../../../../tests/fixtures/ddragon-16.22.1-item-haste.json";
import { ASSET_RULES_FORMAT, compactAssets, compactBuildData, isRiftItem, itemHaste } from "./assets";

/*
  The static data Matchup Intel's build evidence rests on (docs/MATCHUP_INTEL.md, "Static data"):
  items' shop facts and the ability haste their stats name, summoner spells' cooldowns, the rune
  trees' slots, all from the three files the version-check job already downloads.
*/

const items = (digest as unknown as { items: Array<[string, string, string, boolean]> }).items;

describe("the ability haste an item's stats give", () => {
  it("parses every one of Summoner's Rift's 72 items whose stats name ability haste (65 purchasable), at 16.22.1", () => {
    expect(items).toHaveLength(72);
    expect(items.filter((i) => i[3])).toHaveLength(65);
    for (const [id, name, stats] of items) {
      const h = itemHaste(`<mainText>${stats}<br></mainText>`);
      expect(h, `${id} ${name}`).not.toBeNull();
      expect(Number.isInteger(h) && h! > 0 && h! <= 100, `${id} ${name}`).toBe(true);
    }
    const byName = Object.fromEntries(items.map(([, name, stats]) => [name, itemHaste(stats)]));
    expect(byName["Glowing Mote"]).toBe(5);
    expect(byName["Blackfire Torch"]).toBe(20);
    expect(byName["The Brutalizer"]).toBe(10);
  });

  it("reads none where the stats name none, or there are no stats", () => {
    expect(itemHaste("<mainText><stats><attention>25</attention> Attack Damage</stats></mainText>")).toBeNull();
    expect(itemHaste("<mainText>20 Ability Haste outside the stats</mainText>")).toBeNull();
    expect(itemHaste(undefined)).toBeNull();
  });
});

describe("compactAssets and compactBuildData", () => {
  const item = { name: "Kindlegem", description: "<mainText><stats><attention>200</attention> Health<br><attention>10</attention> Ability Haste</stats></mainText>", gold: { base: 400, total: 800, sell: 560, purchasable: true }, tags: ["Health", "CooldownReduction"], from: ["1028"], into: ["3067x"], depth: 2, maps: { "11": true, "12": true } };
  const files = [
    { data: { "3067": item, "223067": { ...item, name: "Arena copy" }, "3001": { ...item, maps: { "11": false } } } },
    { data: { SummonerFlash: { id: "SummonerFlash", key: "4", name: "Flash", cooldown: [300] }, SummonerDot: { id: "SummonerDot", key: "14", name: "Ignite", cooldown: [180] } } },
    [{ id: 8000, name: "Precision", icon: "p.png", slots: [{ runes: [{ id: 8005, name: "Press the Attack", icon: "a.png" }, { id: 8008, name: "Lethal Tempo", icon: "b.png" }] }, { runes: [{ id: 9101, name: "Absorb Life", icon: "c.png" }] }] }],
  ] as const;
  const assets = compactAssets("16.22.1", files[0], files[1], files[2]);
  const build = compactBuildData("16.22.1", files[0], files[1], files[2]);

  it("keeps Summoner's Rift's items only, with their gold, tags, build path, depth and haste", () => {
    expect(Object.keys(build.itemInfo)).toEqual(["3067"]);
    expect(build.itemInfo["3067"]).toEqual({ gold: { base: 400, total: 800, sell: 560, purchasable: true }, tags: ["Health", "CooldownReduction"], from: ["1028"], into: ["3067x"], depth: 2, haste: 10 });
    expect(isRiftItem("223067", { maps: { "11": true } })).toBe(false);
    // Names stay for every item, as before.
    expect(assets.items["223067"]).toBe("Arena copy");
  });

  it("keeps summoner spells' base cooldowns and the rune trees' slots", () => {
    expect(build.spellCooldowns).toEqual({ "4": [300], "14": [180] });
    expect(build.runeSlots).toEqual({ "8000": [[8005, 8008], [9101]] });
    expect([assets.format, build.format]).toEqual([ASSET_RULES_FORMAT, ASSET_RULES_FORMAT]);
  });

  it("keeps the names that every match read loads free of the build data (R6 review SR6-SEC-5)", () => {
    expect(Object.keys(assets).sort()).toEqual(["format", "items", "runes", "spells", "version"]);
  });
});
