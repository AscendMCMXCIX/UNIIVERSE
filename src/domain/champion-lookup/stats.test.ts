import { describe, expect, it } from "vitest";
import abilityFixture from "@/server/riot/fixtures/champion-abilities.fixture.json";
import { resourceName, statRows } from "./stats";
import type { DdragonChampionAbilities } from "./types";

/*
  Champion Intel's base statistics (docs/CHAMPION_INTEL.md, "Base statistics"): the rules on every
  champion of the committed Data Dragon copy (16.22.1, 173 champions), what Riot's data gives as a
  placeholder (attack damage growth, 0 for all), and the resources whose pools are shown.
*/

const records = Object.values((abilityFixture as unknown as { champions: Record<string, DdragonChampionAbilities> }).champions);

describe("base statistics at Data Dragon 16.22.1", () => {
  it("has Riot's stats for every champion, and attack damage growth 0 for all 173 (a placeholder, so never shown)", () => {
    expect(records).toHaveLength(173);
    for (const r of records) expect(r.facts?.stats, r.championId).toBeTruthy();
    expect(records.every((r) => r.facts!.stats.attackdamageperlevel === 0)).toBe(true);
    for (const r of records) expect(statRows(r.facts).find((s) => s.key === "attackdamage")!.growth, r.championId).toBeNull();
  });

  it("shows health, armour, magic resist, attack damage, attack speed, range and move speed for every champion, mana or energy only for theirs", () => {
    for (const r of records) {
      const keys = statRows(r.facts).map((s) => s.key);
      expect(keys, r.championId).toEqual(expect.arrayContaining(["hp", "hpregen", "attackdamage", "attackspeed", "armor", "spellblock", "attackrange", "movespeed"]));
      const resource = r.facts!.partype;
      expect(keys.includes("mp"), r.championId).toBe(resource === "Mana" || resource === "Energy");
    }
    const count = (p: string) => records.filter((r) => r.facts!.partype === p).length;
    expect({ mana: count("Mana"), energy: count("Energy") }).toEqual({ mana: 145, energy: 6 });
  });

  it("works Ahri's numbers, and shows a growth of 0 as none (Thresh's armour, an energy pool)", () => {
    const ahri = statRows(records.find((r) => r.championId === "Ahri")!.facts);
    expect(ahri.find((s) => s.key === "hp")).toEqual({ key: "hp", label: "Health", base: 590, growth: 104, growthUnit: "" });
    expect(ahri.find((s) => s.key === "attackspeed")).toEqual({ key: "attackspeed", label: "Attack speed", base: 0.668, growth: 2.2, growthUnit: "%" });
    expect(ahri.find((s) => s.key === "mp")).toMatchObject({ label: "Mana", base: 418, growth: 25 });
    expect(ahri.find((s) => s.key === "attackrange")).toMatchObject({ base: 550, growth: null });
    expect(statRows(records.find((r) => r.championId === "Thresh")!.facts).find((s) => s.key === "armor")!.growth).toBeNull();
    expect(statRows(records.find((r) => r.championId === "Zed")!.facts).find((s) => s.key === "mp")).toMatchObject({ label: "Energy", base: 200, growth: null });
    // Viego's resource is "None", whatever his mp says (10000).
    expect(statRows(records.find((r) => r.championId === "Viego")!.facts).some((s) => s.key === "mp")).toBe(false);
  });

  it("names a resource as Riot does, none for \"None\" or an empty one", () => {
    expect(resourceName("Mana")).toBe("Mana");
    expect(resourceName("Blood Well")).toBe("Blood Well");
    expect(resourceName("None")).toBeNull();
    expect(resourceName("")).toBeNull();
    expect(resourceName(null)).toBeNull();
    expect(statRows(null)).toEqual([]);
    expect(statRows({ partype: "Mana", tags: [], stats: { hp: -1, armor: Number.NaN, movespeed: 330 } })).toEqual([{ key: "movespeed", label: "Move speed", base: 330, growth: null, growthUnit: "" }]);
  });
});
