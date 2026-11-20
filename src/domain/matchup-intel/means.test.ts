import { describe, expect, it } from "vitest";
import abilityFixture from "@/server/riot/fixtures/champion-abilities.fixture.json";
import { formatPerRank } from "@/lib/format";
import { HASTE_CHOICES, hastedSeconds, meansLine, meansPart, type HasteBasis, type MeansAbility } from "./haste";
import { refusedWords, estimateWord } from "./refused-words";
import type { DdragonChampionAbilities } from "./types";

/*
  The briefing rows' "what it means" lines (docs/MATCHUP_INTEL.md, "What it means"): one line of
  numbers only per row that names an enemy ability, by the cooldown table's own haste rule, never a
  verdict, a timer or a "ready at", and held to REFUSED_WORDS.
*/

const basis = (mark: HasteBasis["mark"], seconds: number[], ultimate = false): HasteBasis => ({ mark, lines: seconds.length ? [{ form: null, seconds }] : [], ultimate });
const darius = (b: HasteBasis): MeansAbility => ({ champion: "Darius", slot: "E", basis: b });
const champions = (abilityFixture as unknown as { champions: Record<string, DdragonChampionAbilities> }).champions;

describe("what it means", () => {
  it("Riot's general rule: the base at 0 haste, the hasted value above it, as the cooldown table has them", () => {
    const e = (champions.Darius!.abilities as Array<{ slot: string; cooldown: number[] }>).find((s) => s.slot === "E")!;
    expect(e.cooldown).toEqual([26, 23.5, 21, 18.5, 16]);
    const b = basis("general", [...e.cooldown]);
    expect(meansPart(darius(b), 20)).toContain("21.67 / 19.58 / 17.5 / 15.42 / 13.33");
    expect(meansPart(darius(b), 0)).toBe(`Darius's E cooldown ${formatPerRank(e.cooldown, "s")}, at 0 ability haste (base)`);
    expect(meansPart(darius(b), 20)).toBe(`Darius's E cooldown ${e.cooldown.map((s) => hastedSeconds(s, 20)).join(" / ")}\u00a0s, at 20 ability haste (Riot's general rule)`);
  });

  it("static per the checked notes: the base at any haste, and says so", () => {
    for (const h of HASTE_CHOICES) expect(meansPart(darius(basis("static", [10, 9, 8])), h)).toBe(`Darius's E cooldown 10 / 9 / 8\u00a0s, at ${h} ability haste (static per the checked notes: haste doesn't shorten it)`);
  });

  it("whether haste shortens it isn't known: the base, and says so", () => {
    expect(meansPart(darius(basis("unknown", [12])), 40)).toBe("Darius's E cooldown 12\u00a0s, at 40 ability haste (whether haste shortens it isn't known)");
  });

  it("R: ability haste only", () => {
    const r: MeansAbility = { champion: "Darius", slot: "R", basis: basis("general", [100, 90, 80], true) };
    expect(meansPart(r, 0)).toBe("Darius's R cooldown 100 / 90 / 80\u00a0s, at 0 ability haste (base, ability haste only)");
    expect(meansPart(r, 20)).toMatch(/, at 20 ability haste \(Riot's general rule, ability haste only\)$/);
  });

  it("no line without the numbers, for charges or a passive's own, or for more than one form", () => {
    expect(meansPart(darius(basis("none", [])), 20)).toBeNull();
    expect(meansPart(darius(basis("not-covered", [20])), 20)).toBeNull();
    expect(meansPart(darius({ mark: "general", lines: [{ form: "Human", seconds: [8] }, { form: "Cougar", seconds: [5] }], ultimate: false }), 20)).toBeNull();
    // A row that names no enemy ability has no line.
    expect(meansLine([], 20)).toBeNull();
    expect(meansLine([darius(basis("none", []))], 20)).toBeNull();
  });

  it("joins a row's enemy abilities into its one line", () => {
    expect(meansLine([darius(basis("general", [12])), { champion: "Darius", slot: "W", basis: basis("static", [7]) }], 0)).toBe("Darius's E cooldown 12\u00a0s, at 0 ability haste (base); Darius's W cooldown 7\u00a0s, at 0 ability haste (static per the checked notes: haste doesn't shorten it)");
  });

  it("passes REFUSED_WORDS in every case, with no estimate, timer or 'ready at'", () => {
    const lines: string[] = [];
    for (const mark of ["general", "static", "unknown"] as const)
      for (const ultimate of [false, true]) for (const h of [0, ...HASTE_CHOICES, 300]) lines.push(meansPart({ champion: "Darius", slot: ultimate ? "R" : "E", basis: basis(mark, [24, 21, 18], ultimate) }, h)!);
    for (const l of lines) {
      expect(refusedWords(l), l).toEqual([]);
      expect(estimateWord(l), l).toBeNull();
      expect(l, l).not.toMatch(/ready|timer|\bat \d+:\d|\bclock|countdown/i);
    }
  });
});
