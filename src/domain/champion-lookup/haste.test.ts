import { describe, expect, it } from "vitest";
import abilityFixture from "@/server/riot/fixtures/champion-abilities.fixture.json";
import { ddragonCooldownDisplay, type CooldownDisplay } from "./cooldown";
import { HASTE_MAX, clampHaste, cooldownAtHaste, hasteReduction, hastedSeconds, readHasteField } from "./haste";
import type { DdragonChampionAbilities } from "./types";

/*
  Cooldowns at a chosen ability haste (docs/CHAMPION_INTEL.md, "Haste"): Riot's rule on every
  ordinary cooldown of the committed Data Dragon copy, at every haste from 0 to the maximum, and
  never on a special case; the haste as the field and the address take it.
*/

const champions = Object.values((abilityFixture as unknown as { champions: Record<string, DdragonChampionAbilities> }).champions);
const displays = champions.flatMap((c) => c.abilities.map((a) => ({ id: `${c.championId} ${a.slot}`, d: ddragonCooldownDisplay(a) })));
const HASTES = Array.from({ length: HASTE_MAX + 1 }, (_, h) => h);

describe("cooldowns at a haste", () => {
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

describe("the haste field", () => {
  it("takes a whole number from 0 to the maximum in digits, spaces around it ignored, 0 when empty", () => {
    expect(readHasteField("")).toEqual({ value: 0, note: null });
    expect(readHasteField("   ", 40)).toEqual({ value: 0, note: null });
    expect(readHasteField("0")).toEqual({ value: 0, note: null });
    expect(readHasteField("20")).toEqual({ value: 20, note: null });
    expect(readHasteField(" 7 ")).toEqual({ value: 7, note: null });
    expect(readHasteField(" 45 ", 10)).toEqual({ value: 45, note: null });
    expect(readHasteField("045")).toEqual({ value: 45, note: null });
    expect(readHasteField("300")).toEqual({ value: 300, note: null });
  });

  it("holds more than the maximum to it, and says so", () => {
    expect(readHasteField("301")).toEqual({ value: 300, note: "held" });
    expect(readHasteField("999", 20)).toEqual({ value: 300, note: "held" });
    expect(readHasteField("123456")).toEqual({ value: 300, note: "held" });
    expect(readHasteField("9".repeat(50))).toEqual({ value: 300, note: "held" });
  });

  it("never takes a fraction: the haste in use is kept, and it says whole numbers only", () => {
    expect(readHasteField("12.5", 12)).toEqual({ value: 12, note: "whole" });
    expect(readHasteField("12.5")).toEqual({ value: 0, note: "whole" });
    expect(readHasteField("12.", 12)).toEqual({ value: 12, note: "whole" });
    expect(readHasteField("12,75", 30)).toEqual({ value: 30, note: "whole" });
    expect(readHasteField(".5")).toEqual({ value: 0, note: "whole" });
    expect(readHasteField("12.5.5", 12)).toEqual({ value: 12, note: "digits" });
  });

  // The Release 17 review: "-20" read as 20 and "1e3" as 13, silently. Neither, nor anything else
  // that is not digits alone, is taken now: the haste in use stays and the field says digits only.
  it("never takes a sign, an exponent, letters or a pasted sentence: the haste in use is kept, and it says digits only", () => {
    for (const [raw, inUse] of [
      ["-20", 0],
      ["-20", 35],
      ["−5", 10],
      ["-", 0],
      ["+5", 0],
      ["+5", 40],
      ["1e3", 1],
      ["1e3", 0],
      ["4a5x", 4],
      ["abc", 60],
      ["20 haste", 0],
      ["1 0 0", 10],
      ["0x20", 0],
      ["２０", 0],
      ["Infinity", 0],
      ["NaN", 0],
    ] as const) {
      expect(readHasteField(raw, inUse), `${raw} with ${inUse} in use`).toEqual({ value: inUse, note: "digits" });
    }
  });

  it("never throws, and never gives a value outside 0 to the maximum", () => {
    for (const raw of [null, undefined, 5, {}, "∞", "NaN", "1e9", "0x20", "２０", "🙂", "9".repeat(50)]) {
      for (const inUse of [0, 20, -5, 999, Number.NaN]) {
        const f = readHasteField(raw, inUse);
        expect(Number.isInteger(f.value) && f.value >= 0 && f.value <= HASTE_MAX, `${String(raw)} with ${inUse}`).toBe(true);
      }
    }
  });
});
