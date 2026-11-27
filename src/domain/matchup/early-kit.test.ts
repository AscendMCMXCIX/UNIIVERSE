import { describe, expect, it } from "vitest";
import abilityFixture from "@/server/riot/fixtures/champion-abilities.fixture.json";
import { lookupChampion } from "@/domain/champion-lookup/view";
import type { DdragonChampionAbilities } from "@/domain/champion-lookup/types";
import { EARLY_STATS, differenceWords, earlyKitLines, kitChange, kitLine } from "./early-kit";
import { evidenceRefusedWords } from "./refused-words";

/* Matchup Intel's "From Riot's data" block (docs/MATCHUP_INTEL.md): level-1 differences of the same quantity, in neutral words, for every pair. */

const fixture = (abilityFixture as unknown as { champions: Record<string, DdragonChampionAbilities> }).champions;
const view = (id: string) => lookupChampion({ id, name: id, title: "", portrait: "" }, fixture[id]!);
const ids = Object.keys(fixture).sort();
const NEUTRAL = /\b(faster|slower|better|worse|advantage|stronger|weaker|favou?red|wins?|outranges?)\b/i;

describe("the level-1 lines", () => {
  it("are five for every pair of the roster's first 20 champions, and for the whole roster against Ahri, each equal to the columns' own numbers", () => {
    const pairs: Array<[string, string]> = [];
    for (const a of ids.slice(0, 20)) for (const b of ids.slice(0, 20)) if (a !== b) pairs.push([a, b]);
    for (const id of ids) if (id !== "Ahri") pairs.push(["Ahri", id], [id, "Ahri"]);
    for (const [a, b] of pairs) {
      const [va, vb] = [view(a), view(b)];
      const lines = earlyKitLines(va, vb);
      expect(lines.map((l) => l.key), `${a} vs ${b}`).toEqual(EARLY_STATS.map((s) => s.key));
      for (const l of lines) {
        expect(l.a).toBe(va.facts!.stats.find((s) => s.key === l.key)!.base);
        expect(l.b).toBe(vb.facts!.stats.find((s) => s.key === l.key)!.base);
        expect(l.diff).toBeCloseTo(Math.abs(l.a - l.b), 6);
        expect(l.more).toBe(l.a === l.b ? null : l.a > l.b ? 0 : 1);
        expect(l.words).toBe(differenceWords(l.diff, l.more === null ? null : l.more === 0 ? a : b));
        if (l.more !== null) expect(l.words).toMatch(new RegExp(` more for ${l.more === 0 ? a : b}$`));
        expect(l.words).not.toMatch(NEUTRAL);
        expect(evidenceRefusedWords(l.words)).toEqual([]);
      }
    }
  });

  it("say 'the same' at equality, name the champion with more, and compare only one quantity a line", () => {
    expect(kitLine("armor", "Armor", 36, 32, ["Darius", "Riven"])).toMatchObject({ more: 0, diff: 4, words: "4 more for Darius" });
    expect(kitLine("armor", "Armor", 32, 36, ["Darius", "Riven"])).toMatchObject({ more: 1, words: "4 more for Riven" });
    expect(kitLine("movespeed", "Move speed", 340, 340, ["Darius", "Riven"])).toMatchObject({ more: null, diff: 0, words: "the same" });
    expect(kitLine("hp", "Health", 0.1 + 0.2, 0.3, ["A", "B"])!.words).toBe("the same");
    expect(kitLine("hp", "Health", 652, null, ["A", "B"])).toBeNull();
    expect(differenceWords(1250, "Ahri")).toBe("1,250 more for Ahri");
  });

  it("never compute a value at a level above 1: every number is Riot's base value as stored", () => {
    const lines = earlyKitLines(view("Darius"), view("Riven"));
    const stats = view("Darius").facts!.stats;
    for (const l of lines) expect(stats.find((s) => s.key === l.key)!.base).toBe(l.a);
    expect(lines.some((l) => l.key === "attackdamage")).toBe(false);
  });

  it("are none where either champion has no statistics stored, and take reviewed range lines only through the hook", () => {
    const bare = { ...view("Ahri"), facts: null };
    expect(earlyKitLines(bare, view("Zed"))).toEqual([]);
    expect(earlyKitLines(view("Ahri"), view("Zed"), { ranges: () => [kitLine("range-q", "Q range", 970, 900, ["Ahri", "Zed"])!] }).at(-1)).toMatchObject({ key: "range-q", words: "70 more for Ahri" });
  });
});

describe("Riot's changes", () => {
  it("name each ability's slot and what changed, and the base statistics, never by how much", () => {
    const v = view("Darius");
    const changed = { ...v, abilities: v.abilities!.map((a) => (a.slot === "E" ? { ...a, changed: { sincePatch: "26.22", text: true, cooldown: true, cost: false } } : a)), facts: { ...v.facts!, statsChangedSincePatch: "26.22" } };
    expect(kitChange(changed)).toEqual({ champion: "Darius", sincePatch: "26.22", parts: ["E text and cooldowns", "base stats"] });
    expect(kitChange(view("Riven"))).toBeNull();
  });
});
