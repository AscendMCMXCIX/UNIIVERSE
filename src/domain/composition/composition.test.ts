import { describe, expect, it } from "vitest";
import { getChampionProfile } from "../champion-model";
import { compositionIdentity, compositionInteraction, compositionNeeds, teamProfile } from "./index";

const traits = (...ids: string[]) => ids.map((id) => getChampionProfile(id).traits);

describe("composition model", () => {
  it("flags missing engage and frontline on a squishy poke draft", () => {
    const needs = compositionNeeds(teamProfile(traits("Jayce", "Xerath", "Ezreal", "Karma")));
    expect(needs.map((n) => n.key)).toContain("engage");
    expect(needs.map((n) => n.key)).toContain("frontline");
  });

  it("is satisfied by a coherent engage composition", () => {
    const needs = compositionNeeds(teamProfile(traits("Ornn", "JarvanIV", "Orianna", "Jinx", "Lulu")));
    expect(needs.find((n) => n.key === "engage")).toBeUndefined();
    expect(needs.find((n) => n.key === "frontline")).toBeUndefined();
    expect(needs.find((n) => n.key === "carryProtection")).toBeUndefined();
  });

  it("classifies identities", () => {
    expect(compositionIdentity(teamProfile(traits("Camille", "Hecarim", "Akali", "Kaisa", "Rakan"))).primary).toBe("Dive");
    expect(compositionIdentity(teamProfile(traits("Ornn", "Sejuani", "Orianna", "Jinx", "Lulu"))).primary).toMatch(/Front-to-back|Teamfight engage/);
    expect(compositionIdentity(teamProfile(traits("Jayce", "Nidalee", "Xerath", "Ezreal", "Karma"))).primary).toBe("Poke / Siege");
  });

  it("recognises enemy interaction dynamics", () => {
    const ours = teamProfile(traits("Malphite", "JarvanIV", "Orianna", "MissFortune", "Rell"));
    const pokeEnemy = teamProfile(traits("Jayce", "Nidalee", "Xerath", "Ezreal", "Karma"));
    const r = compositionInteraction(ours, pokeEnemy);
    expect(r.score).toBeGreaterThan(0);
    expect(r.notes.some((n) => /engage should land/.test(n.text))).toBe(true);

    const diveEnemy = teamProfile(traits("Camille", "Hecarim", "Akali", "Kaisa", "Rakan"));
    const squishy = teamProfile(traits("Jayce", "Nidalee", "Xerath", "Ezreal", "Karma"));
    const r2 = compositionInteraction(squishy, diveEnemy);
    expect(r2.notes.some((n) => /dive threatens/.test(n.text))).toBe(true);
    expect(r2.score).toBeLessThan(0);
  });
});

describe("team profile internals", () => {
  it("keeps every trait in place when profiles are built from cached vectors", async () => {
    const { TRAIT_KEYS, emptyTraits } = await import("../champion-model/traits");
    const { teamProfile } = await import("./profile");
    // Distinct values per trait so a swapped position would show.
    const a = Object.fromEntries(TRAIT_KEYS.map((k, i) => [k, (i % 4) + 0.25])) as ReturnType<typeof emptyTraits>;
    const b = Object.fromEntries(TRAIT_KEYS.map((k, i) => [k, ((i + 2) % 4) + 0.5])) as ReturnType<typeof emptyTraits>;
    const p = teamProfile([a, b, a]);
    for (const k of TRAIT_KEYS) {
      expect(p.totals[k]).toBe(a[k] + b[k] + a[k]);
      expect(p.maxes[k]).toBe(Math.max(a[k], b[k]));
    }
    expect(Object.keys(emptyTraits())).toEqual([...TRAIT_KEYS]);
    expect(Object.keys(p.totals)).toEqual([...TRAIT_KEYS]);
  });
});
