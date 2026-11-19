import { describe, expect, it } from "vitest";
import abilityFixture from "@/server/riot/fixtures/champion-abilities.fixture.json";
import { getChampionNotes } from "@/server/matchup-intel/curated";
import { cooldownDisplay, modifiersView } from "./cooldown";
import { GENERAL_RULE_TIP, HASTE_MAX, clampHaste, cooldownAtHaste, hasteBasisOf, hasteMarkWords, hastedSeconds } from "./haste";
import { refusedWords } from "./refused-words";
import type { DdragonChampionAbilities } from "./types";

const champions = Object.values((abilityFixture as unknown as { champions: Record<string, DdragonChampionAbilities> }).champions);
const HASTES = [10, 20, 40, 60];

/** Every ability's basis as the page builds it (view.ts), its checked notes current on the fixture's version. */
const bases = champions.flatMap((c) => {
  const notes = getChampionNotes(c.championId);
  return c.abilities.map((a) => {
    const n = notes?.abilities[a.slot];
    const display = cooldownDisplay(a, n, n ? "current" : null);
    return { id: `${c.championId} ${a.slot}`, display, basis: hasteBasisOf(a.slot, display, modifiersView(n?.modifiers, a.maxRank), { static: n?.modifiers?.static === true }) };
  });
});

describe("cooldowns at a chosen haste", () => {
  it("applies Riot's general rule, base × 100 / (100 + haste), to every ability without a static or open mark, at four haste values", () => {
    const general = bases.filter((b) => b.basis.mark === "general");
    expect(general.length).toBeGreaterThan(600);
    for (const { basis } of general) {
      for (const h of HASTES) {
        const at = cooldownAtHaste(basis, h);
        at.forEach((line, i) => line.seconds.forEach((s, r) => expect(s).toBe(Math.round(((basis.lines[i]!.seconds[r]! * 100) / (100 + h)) * 100) / 100)));
      }
      expect(hasteMarkWords(basis)).toMatch(/^Riot's general rule/);
    }
  });

  it("shows a static checked ability at its base at every haste", () => {
    // None of the six champions' checked cooldowns is static today (their static marks are lockouts between casts, said in words).
    expect(bases.filter((b) => b.basis.mark === "static")).toEqual([]);
    const basis = hasteBasisOf("W", { kind: "per-rank", seconds: [20, 18, 16], starts: "on-cast", from: "curated" }, { static: true });
    expect(basis.mark).toBe("static");
    for (const h of HASTES) expect(cooldownAtHaste(basis, h)).toEqual(basis.lines);
    expect(hasteMarkWords(basis)).toBe("Static: haste doesn't shorten it");
  });

  it("shows Death's Grasp at its base only, saying whether haste shortens it isn't known", () => {
    const e = bases.find((b) => b.id === "Mordekaiser E")!;
    expect(e.basis.mark).toBe("unknown");
    expect(cooldownAtHaste(e.basis, 40)[0]!.seconds).toEqual([16, 14, 12, 10, 8]);
    expect(hasteMarkWords(e.basis)).toBe("Whether haste shortens it isn't known");
  });

  it("marks R 'ability haste only'", () => {
    const r = bases.find((b) => b.id === "Darius R")!;
    expect(r.basis.mark).toBe("general");
    expect(hasteMarkWords(r.basis)).toBe("Riot's general rule · ability haste only");
  });

  it("never hastes charges, a passive's own cooldown, or a line with no number", () => {
    expect(hasteBasisOf("Q", { kind: "charges", charges: [2], recharge: [10] }, null).mark).toBe("not-covered");
    expect(hasteBasisOf("P", { kind: "passive", seconds: [10], scalesWith: "none", levels: null, perTarget: false, static: false, starts: null }, null).mark).toBe("not-covered");
    expect(hasteBasisOf("P", { kind: "passive", seconds: [10], scalesWith: "none", levels: null, perTarget: false, static: true, starts: null }, null).mark).toBe("static");
    expect(hasteBasisOf("Q", { kind: "unknown", reason: "no-number-in-ddragon" }, null).mark).toBe("none");
    expect(cooldownAtHaste(hasteBasisOf("Q", { kind: "charges", charges: [2], recharge: [10] }, null), 60)[0]!.seconds).toEqual([10]);
  });

  it("drops the notes' static mark once Riot's record moved after the check", () => {
    const d = { kind: "per-rank", seconds: [10], starts: null, from: "ddragon" } as const;
    expect(hasteBasisOf("Q", d, { static: true }).mark).toBe("static");
    expect(hasteBasisOf("Q", d, { static: true }, { ignoreStatic: true }).mark).toBe("general");
  });

  it("takes haste as a whole number from 0 to its maximum", () => {
    expect([clampHaste(-5), clampHaste("20"), clampHaste(33.9), clampHaste(9999), clampHaste("x"), clampHaste(null)]).toEqual([0, 20, 33, HASTE_MAX, 0, 0]);
    expect(hastedSeconds(10, 0)).toBe(10);
    expect(hastedSeconds(10, 25)).toBe(8);
    expect(hastedSeconds(120, 60)).toBe(75);
  });

  it("words its marks within the refused-words list", () => {
    for (const mark of ["general", "static", "unknown", "not-covered", "none"] as const) expect(refusedWords(hasteMarkWords({ mark, lines: [], ultimate: false }))).toEqual([]);
    expect(refusedWords(GENERAL_RULE_TIP)).toEqual([]);
  });
});
