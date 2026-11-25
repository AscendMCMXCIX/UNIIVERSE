import { describe, expect, it } from "vitest";
import abilityFixture from "@/server/riot/fixtures/champion-abilities.fixture.json";
import { costDisplay } from "./cost";
import type { DdragonChampionAbilities } from "./types";

/*
  Champion Intel's ability costs (docs/CHAMPION_INTEL.md, "Cost"): the rule on every spell of the
  committed Data Dragon copy (16.22.1, 692 spells), and its edge cases. A cost is shown only where
  Riot's own resource line is filled from the ability's own data; a zero, a placeholder or a health
  cost is never shown as a number.
*/

const records = Object.values((abilityFixture as unknown as { champions: Record<string, DdragonChampionAbilities> }).champions);
const spells = records.flatMap((r) => r.abilities.filter((a) => a.slot !== "P").map((a) => ({ id: `${r.championId} ${a.slot}`, a, partype: r.facts!.partype })));

describe("costs at Data Dragon 16.22.1", () => {
  it("shows 552 per rank, 93 as no cost, 5 in Riot's words and nothing for the other 42", () => {
    expect(spells).toHaveLength(692);
    const count: Record<string, number> = {};
    for (const { a, partype } of spells) {
      const k = costDisplay(a, partype)?.kind ?? "nothing";
      count[k] = (count[k] ?? 0) + 1;
    }
    expect(count).toEqual({ "per-rank": 552, none: 93, words: 5, nothing: 42 });
  });

  it("gives a per-rank cost only for Riot's \"{{ cost }}\" line, a Mana or Energy champion, one number per rank, never all zeros", () => {
    for (const { id, a, partype } of spells) {
      const d = costDisplay(a, partype);
      if (d?.kind !== "per-rank") continue;
      expect(["{{ cost }} {{ abilityresourcename }}", `{{ cost }} ${partype}`], id).toContain(a.resource);
      expect(["Mana", "Energy"], id).toContain(partype);
      expect(d.values, id).toEqual(a.cost);
      expect(d.values.length, id).toBe(a.maxRank);
      expect(d.values.some((v) => v > 0), id).toBe(true);
      expect(d.resource, id).toBe(partype);
    }
  });

  it("works the examples: Ahri's Q, Akali's Q in Energy, Garen's Q at no cost, Rengar's Ferocity, Samira's R's zeros", () => {
    const find = (id: string, slot: string) => spells.find((s) => s.id === `${id} ${slot}`)!;
    const at = (id: string, slot: string) => costDisplay(find(id, slot).a, find(id, slot).partype);
    expect(at("Ahri", "Q")).toEqual({ kind: "per-rank", values: [55, 65, 75, 85, 95], resource: "Mana" });
    expect(at("Akali", "Q")).toEqual({ kind: "per-rank", values: [110, 100, 90, 80, 70], resource: "Energy" });
    expect(at("Garen", "Q")).toEqual({ kind: "none" });
    expect(at("Rengar", "Q")).toEqual({ kind: "words", text: "Generates 1 Ferocity" });
    // All zeros for "{{ cost }} {{ abilityresourcename }}": a placeholder, not free.
    expect(at("Samira", "R")).toBeNull();
    // A health cost, whose number Data Dragon leaves out.
    expect(at("DrMundo", "Q")).toBeNull();
  });
});

describe("edge cases", () => {
  const spell = { slot: "Q" as const, maxRank: 3 };
  it("shows nothing for the passive, a record without a resource line, a placeholder or a mismatch", () => {
    expect(costDisplay({ slot: "P", maxRank: 1, resource: "No Cost" }, "Mana")).toBeNull();
    expect(costDisplay({ ...spell }, "Mana")).toBeNull();
    expect(costDisplay(null, "Mana")).toBeNull();
    expect(costDisplay({ ...spell, resource: "{{ cost }} {{ abilityresourcename }}", cost: [10, 20] }, "Mana")).toBeNull();
    expect(costDisplay({ ...spell, resource: "{{ cost }} {{ abilityresourcename }}", cost: [10, 20, Number.NaN] }, "Mana")).toBeNull();
    expect(costDisplay({ ...spell, resource: "{{ cost }} {{ abilityresourcename }}", cost: [10, 20, 30] }, "Fury")).toBeNull();
    expect(costDisplay({ ...spell, resource: "{{ cost }} Mana", cost: [10, 20, 30] }, "Energy")).toBeNull();
    expect(costDisplay({ ...spell, resource: "{{ healthcost }} Health", cost: [10, 20, 30] }, "Mana")).toBeNull();
    expect(costDisplay({ ...spell, resource: "Passive" }, "Mana")).toBeNull();
    expect(costDisplay({ ...spell, resource: "x".repeat(80) }, "Mana")).toBeNull();
  });

  it("reads Riot's line loosely as to space and case, and \"No cost\" in either case", () => {
    expect(costDisplay({ ...spell, resource: "  {{ cost }}   {{ abilityresourcename }} ", cost: [1, 2, 3] }, "Mana")).toEqual({ kind: "per-rank", values: [1, 2, 3], resource: "Mana" });
    expect(costDisplay({ ...spell, resource: "No cost" }, "Mana")).toEqual({ kind: "none" });
  });
});
