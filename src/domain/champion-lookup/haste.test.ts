import { describe, expect, it } from "vitest";
import abilityFixture from "@/server/riot/fixtures/champion-abilities.fixture.json";
import { ddragonCooldownDisplay, type CooldownDisplay } from "./cooldown";
import { HASTE_CHOICES, HASTE_MAX, clampHaste, cooldownAtHaste, hasteReduction, hastedSeconds } from "./haste";
import type { DdragonChampionAbilities } from "./types";

/*
  Cooldowns at a chosen ability haste (docs/CHAMPION_LOOKUP.md, "Haste"): Riot's rule on every
  ordinary cooldown of the committed Data Dragon copy, at every quick value and the maximum, and
  never on a special case; the haste as the page takes it.
*/

const champions = Object.values((abilityFixture as unknown as { champions: Record<string, DdragonChampionAbilities> }).champions);
const displays = champions.flatMap((c) => c.abilities.map((a) => ({ id: `${c.championId} ${a.slot}`, d: ddragonCooldownDisplay(a) })));
const HASTES = [...HASTE_CHOICES, 7, 33, 150, HASTE_MAX];

describe("cooldowns at a haste", () => {
  it("offers the owner's quick values", () => {
    expect([...HASTE_CHOICES]).toEqual([0, 10, 20, 30, 40, 50, 60, 80, 100]);
  });

  it("applies base × 100 / (100 + haste), to two decimals, to every cooldown that passed the guard", () => {
    const ordinary = displays.filter((x) => x.d.kind === "per-rank");
    expect(ordinary).toHaveLength(623);
    for (const { id, d } of ordinary) {
      if (d.kind !== "per-rank") continue;
      for (const h of HASTES) {
        const at = cooldownAtHaste(d, h)!;
        expect(at, `${id} at ${h}`).toEqual(d.seconds.map((s) => Math.round(((s * 100) / (100 + h)) * 100) / 100));
      }
      // At 0, the base itself.
      expect(cooldownAtHaste(d, 0), id).toEqual(d.seconds);
    }
  });

  it("never applies it to a passive, charges, two abilities in one slot, a known-wrong or missing number", () => {
    const special = displays.filter((x) => x.d.kind !== "per-rank");
    expect(special).toHaveLength(242);
    for (const { id, d } of special) for (const h of HASTES) expect(cooldownAtHaste(d, h), `${id} at ${h}`).toBeNull();
    // Riot's listed array for a slot of two abilities is not hasted either.
    const lee: CooldownDisplay = { kind: "unknown", reason: "two-abilities-in-ddragon", listed: [10, 9, 8, 7, 6] };
    expect(cooldownAtHaste(lee, 50)).toBeNull();
  });

  it("works the docs' examples", () => {
    expect(hastedSeconds(7, 20)).toBe(5.83);
    expect(hastedSeconds(7, 100)).toBe(3.5);
    expect(cooldownAtHaste({ kind: "per-rank", seconds: [120, 100, 80] }, 60)).toEqual([75, 62.5, 50]);
    expect(hasteReduction(20)).toBe(16.7);
    expect(hasteReduction(100)).toBe(50);
    expect(hasteReduction(0)).toBe(0);
  });

  it("takes haste as a whole number from 0 to its maximum, anything else as 0", () => {
    expect([clampHaste(-5), clampHaste("20"), clampHaste(" 40 "), clampHaste(33.9), clampHaste("33.9"), clampHaste(9999), clampHaste("9999"), clampHaste("x"), clampHaste("20abc"), clampHaste(""), clampHaste(null), clampHaste(Number.NaN), clampHaste(Number.POSITIVE_INFINITY)]).toEqual([0, 20, 40, 33, 33, HASTE_MAX, HASTE_MAX, 0, 0, 0, 0, 0, 0]);
    expect(HASTE_MAX).toBe(300);
    expect(hastedSeconds(10, 0)).toBe(10);
    expect(hastedSeconds(10, 25)).toBe(8);
    // A haste beyond the maximum is held to it.
    expect(hastedSeconds(10, 1000)).toBe(hastedSeconds(10, HASTE_MAX));
  });
});
