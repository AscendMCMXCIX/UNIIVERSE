import { describe, expect, it } from "vitest";
import { curatedChampionIds, getChampionProfile, TRAIT_KEYS } from "./index";
import { CURATED_ROWS } from "./curated-data";

describe("champion characteristics", () => {
  it("has well-formed curated rows", () => {
    for (const [id, [values, roles]] of Object.entries(CURATED_ROWS)) {
      expect(values, id).toHaveLength(TRAIT_KEYS.length);
      expect(values.every((v) => Number.isInteger(v) && v >= 0 && v <= 3), id).toBe(true);
      const sum = roles.split(",").reduce((s, part) => s + Number(part.split(":")[1]), 0);
      expect(Math.abs(sum - 1), `${id} role prior`).toBeLessThan(0.02);
    }
    expect(curatedChampionIds().length).toBeGreaterThan(150);
  });

  it("describes well-known kits sensibly", () => {
    expect(getChampionProfile("Malphite").traits.engage).toBe(3);
    expect(getChampionProfile("Janna").traits.counterEngage).toBe(3);
    expect(getChampionProfile("Jinx").traits.sustainedDps).toBe(3);
    expect(getChampionProfile("Fiora").traits.sideLane).toBe(3);
    expect(getChampionProfile("Xerath").traits.poke).toBe(3);
    expect(getChampionProfile("Lulu").traits.peel).toBe(3);
    expect(getChampionProfile("MonkeyKing").rolePrior.JUNGLE).toBeGreaterThan(0);
  });

  it("derives a low-confidence profile for an unknown new champion without code changes", () => {
    const p = getChampionProfile("FutureChampion", { tags: ["Marksman"], attackRange: 550, info: { attack: 9, defense: 2, magic: 2, difficulty: 5 } });
    expect(p.curation).toBe("derived");
    expect(p.traits.sustainedDps).toBe(3);
    expect(p.traits.range).toBe(2);
    expect(p.traits.physicalDamage).toBe(3);
    expect(p.rolePrior.ADC).toBeGreaterThan(0.5);
  });
});
